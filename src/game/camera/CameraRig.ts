import * as THREE from "three";

import type { CameraMode } from "../../settings/controls";
import { getCameraTuning, type CameraTuning } from "../../settings/controls";
import { expBlend, normaliseAngle, shortestAngleDiff } from "../../utils/math";
const EPSILON = 1e-5;
const DEFAULT_CHASE_PITCH = degToRad(0);

interface CameraTickContext {
  hasCamInput?: boolean;
  isMoving?: boolean;
  desiredForwardYaw?: number;
  timeSinceCamInput?: number;
}

interface TpsPolicyContext {
  hasCamInput: boolean;
  isMoving: boolean;
  desiredForwardYaw: number;
  timeSinceCamInput: number;
}

interface CollisionConfig {
  radius: number;
  minDistance: number;
  mask?: number;
}

class CameraCollision {
  private readonly raycaster = new THREE.Raycaster();
  private readonly direction = new THREE.Vector3();
  private scene: THREE.Scene | null = null;
  private radius = 0.26;
  private minDistance = 0.55;

  constructor() {
    this.raycaster.layers.enableAll();
  }

  setScene(scene: THREE.Scene | null): void {
    this.scene = scene;
  }

  configure(config: Partial<CollisionConfig>): void {
    if (typeof config.radius === "number") {
      this.radius = Math.max(0, config.radius);
    }
    if (typeof config.minDistance === "number") {
      this.minDistance = Math.max(0, config.minDistance);
    }
  }

  probe(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    ignore: Set<THREE.Object3D>
  ): number {
    if (!this.scene) {
      return Math.max(origin.distanceTo(target), this.minDistance);
    }

    const distanceToTarget = origin.distanceTo(target);
    if (distanceToTarget <= this.minDistance + EPSILON) {
      return this.minDistance;
    }

    this.direction.copy(target).sub(origin);
    const totalDistance = this.direction.length();
    if (totalDistance <= EPSILON) {
      return this.minDistance;
    }
    this.direction.normalize();

    this.raycaster.set(origin, this.direction);
    this.raycaster.near = 0;
    this.raycaster.far = totalDistance;

    const hits = this.raycaster.intersectObjects(this.scene.children, true);

    let allowed = totalDistance;
    for (const hit of hits) {
      if (shouldIgnore(hit.object, ignore)) {
        continue;
      }
      const candidate = hit.distance - this.radius;
      if (candidate < allowed) {
        allowed = Math.max(candidate, this.minDistance);
      }
      if (allowed <= this.minDistance + EPSILON) {
        return this.minDistance;
      }
    }

    allowed = Math.min(allowed, totalDistance);
    return Math.max(allowed, this.minDistance);
  }
}

export class CameraRig {
  private readonly root = new THREE.Object3D();
  private readonly yawNode = new THREE.Object3D();
  private readonly shoulderNode = new THREE.Object3D();
  private readonly pitchNode = new THREE.Object3D();
  private readonly camera: THREE.PerspectiveCamera;

  private readonly tuning: CameraTuning;
  private mode: CameraMode = "chase";
  private followTarget: THREE.Object3D | null = null;
  private scene: THREE.Scene | null = null;

  private readonly pivotOffset = new THREE.Vector3();
  private readonly targetPivot = new THREE.Vector3();
  private readonly currentPivot = new THREE.Vector3();
  private pivotInitialised = false;

  private yawTarget = 0;
  private yawCurrent = 0;
  private pitchTarget = DEFAULT_CHASE_PITCH;
  private pitchCurrent = DEFAULT_CHASE_PITCH;

  private rotationLag = 12;
  private positionLag = 8;

  private readonly tpsShoulderOffset = new THREE.Vector3();
  private readonly currentShoulderOffset = new THREE.Vector3();
  private armLengthTarget = 15;
  private armLengthCurrent = 15;

  private characterHeight = 1.8;
  private eyeHeight = 1.65;

  private readonly collision = new CameraCollision();
  private readonly collisionIgnore = new Set<THREE.Object3D>();

  private hadInputThisFrame = false;
  private lastDesiredForwardYaw = 0;

  private readonly tempVecA = new THREE.Vector3();
  private readonly tempVecB = new THREE.Vector3();
  private readonly tempVecC = new THREE.Vector3();
  private readonly tempBox = new THREE.Box3();
  private readonly tempSize = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    tuning: CameraTuning = getCameraTuning()
  ) {
    this.camera = camera;
    this.tuning = tuning;

    this.root.name = "CameraRigRoot";
    this.yawNode.name = "CameraRigYaw";
    this.shoulderNode.name = "CameraRigShoulder";
    this.pitchNode.name = "CameraRigPitch";

    this.pivotOffset.set(0, tuning.tps.pivotOffsetY, 0);
    this.tpsShoulderOffset.set(
      tuning.tps.shoulderOffset.x,
      tuning.tps.shoulderOffset.y,
      tuning.tps.shoulderOffset.z
    );

    this.rotationLag = tuning.tps.rotationLagGain;
    this.positionLag = tuning.tps.positionLagGain;

    this.armLengthTarget = tuning.tps.armLength;
    this.armLengthCurrent = this.armLengthTarget;

    this.collision.configure({
      radius: tuning.tps.collisionRadius,
      minDistance: tuning.tps.minArmLength,
    });

    this.root.add(this.yawNode);
    this.yawNode.add(this.shoulderNode);
    this.shoulderNode.add(this.pitchNode);
    this.pitchNode.add(this.camera);

    this.updateCharacterMetrics();
    this.applyModeSettings("chase");
    this.updateCollisionIgnore();
    this.lastDesiredForwardYaw = this.yawTarget;
  }

  attachTo(scene: THREE.Scene): void {
    if (!scene.children.includes(this.root)) {
      scene.add(this.root);
    }
    this.scene = scene;
    this.collision.setScene(scene);
    this.updateCollisionIgnore();
  }

  setFollowTarget(target: THREE.Object3D): void {
    this.followTarget = target;
    this.updateCharacterMetrics(target);
    target.getWorldPosition(this.currentPivot);
    this.currentPivot.add(this.pivotOffset);
    this.targetPivot.copy(this.currentPivot);
    this.pivotInitialised = true;
    this.updateShoulderOffsetForMode();
    this.updateCollisionIgnore();
  }

  setPivot(target: THREE.Object3D): void {
    this.setFollowTarget(target);
  }

  setMode(mode: CameraMode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.applyModeSettings(mode);
  }

  getMode(): CameraMode {
    return this.mode;
  }

  configureCollision(config: Partial<CollisionConfig>): void {
    this.collision.configure(config);
    if (typeof config.radius === "number") {
      this.tuning.tps.collisionRadius = config.radius;
    }
    if (typeof config.minDistance === "number") {
      this.tuning.tps.minArmLength = config.minDistance;
    }
  }

  setFov(value: number): void {
    if (this.mode === "chase") {
      this.tuning.tps.fov = value;
    } else {
      this.tuning.fpv.fov = value;
    }
    this.applyFov();
  }

  getFov(): number {
    return this.camera.fov;
  }

  setArmLength(length: number): void {
    const clamped = Math.max(length, this.tuning.tps.minArmLength);
    this.tuning.tps.armLength = clamped;
    if (this.mode === "chase") {
      this.armLengthTarget = clamped;
      this.armLengthCurrent = clamped;
    }
  }

  getArmLength(): number {
    return this.tuning.tps.armLength;
  }

  setShoulderOffset(
    offset: THREE.Vector3 | { x: number; y: number; z: number }
  ): void {
    this.tpsShoulderOffset.set(offset.x, offset.y, offset.z);
    this.tuning.tps.shoulderOffset.x = this.tpsShoulderOffset.x;
    this.tuning.tps.shoulderOffset.y = this.tpsShoulderOffset.y;
    this.tuning.tps.shoulderOffset.z = this.tpsShoulderOffset.z;
    if (this.mode === "chase") {
      this.currentShoulderOffset.copy(this.tpsShoulderOffset);
    }
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getYaw(): number {
    return this.yawCurrent;
  }

  getPitch(): number {
    return this.pitchCurrent;
  }

  setYaw(value: number): void {
    this.yawTarget = normaliseAngle(value);
    this.yawCurrent = this.yawTarget;
  }

  addYaw(delta: number): void {
    if (Math.abs(delta) < EPSILON) {
      return;
    }
    this.yawTarget = normaliseAngle(this.yawTarget + delta);
    this.hadInputThisFrame = true;
  }

  setPitch(value: number): void {
    const limits = this.getPitchLimits();
    this.pitchTarget = clamp(value, limits.min, limits.max);
    this.pitchCurrent = this.pitchTarget;
  }

  addPitch(delta: number): void {
    if (Math.abs(delta) < EPSILON) {
      return;
    }
    const limits = this.getPitchLimits();
    this.pitchTarget = clamp(this.pitchTarget + delta, limits.min, limits.max);
    this.hadInputThisFrame = true;
  }

  alignYawToObject(
    object: THREE.Object3D,
    gain: number,
    deltaTime: number
  ): void {
    const targetYaw = this.extractYaw(object);
    this.alignYawTo(targetYaw, gain, deltaTime);
  }

  alignYawTo(angle: number, gain: number, deltaTime: number): void {
    const delta = shortestAngleDiff(this.yawTarget, angle);
    if (Math.abs(delta) < EPSILON) {
      this.yawTarget = normaliseAngle(angle);
      return;
    }
    const step = expBlend(0, delta, gain, deltaTime);
    this.yawTarget = normaliseAngle(this.yawTarget + step);
  }

  alignPitchTo(value: number, gain: number, deltaTime: number): void {
    const limits = this.getPitchLimits();
    const target = clamp(value, limits.min, limits.max);
    const delta = target - this.pitchTarget;
    if (Math.abs(delta) < EPSILON) {
      this.pitchTarget = target;
      return;
    }
    const step = expBlend(0, delta, gain, deltaTime);
    this.pitchTarget = clamp(this.pitchTarget + step, limits.min, limits.max);
  }

  recenter(yaw?: number): void {
    const desired = typeof yaw === "number" ? yaw : this.lastDesiredForwardYaw;
    this.yawTarget = normaliseAngle(desired);
  }

  tick(deltaTime: number, context: CameraTickContext = {}): void {
    const dt = Math.max(deltaTime, 0);

    const desiredForwardYaw =
      typeof context.desiredForwardYaw === "number"
        ? normaliseAngle(context.desiredForwardYaw)
        : this.lastDesiredForwardYaw;

    if (typeof context.desiredForwardYaw === "number") {
      this.lastDesiredForwardYaw = desiredForwardYaw;
    }

    const hasInput = context.hasCamInput ?? this.hadInputThisFrame;
    const isMoving = context.isMoving ?? false;
    const timeSinceCamInput =
      context.timeSinceCamInput ?? (hasInput ? 0 : Number.POSITIVE_INFINITY);

    this.updateFollowTarget(dt);

    this.updateShoulderOffsetForMode();
    this.shoulderNode.position.copy(this.currentShoulderOffset);

    if (this.mode === "chase") {
      this.tickTPS(dt, {
        hasCamInput: hasInput,
        isMoving,
        desiredForwardYaw,
        timeSinceCamInput,
      });
    } else {
      this.tickFPV(dt);
    }

    this.camera.updateMatrixWorld(true);
    this.hadInputThisFrame = false;
  }

  getForward(out: THREE.Vector3): THREE.Vector3 {
    return this.camera.getWorldDirection(out).normalize();
  }

  private updateFollowTarget(deltaTime: number): void {
    if (this.followTarget) {
      this.followTarget.getWorldPosition(this.targetPivot);
      this.targetPivot.add(this.pivotOffset);
    }

    if (!this.pivotInitialised) {
      this.currentPivot.copy(this.targetPivot);
      this.pivotInitialised = true;
    }

    expSmoothingVector(
      this.currentPivot,
      this.targetPivot,
      this.positionLag,
      deltaTime
    );
    this.root.position.copy(this.currentPivot);
  }

  private tickTPS(deltaTime: number, policy: TpsPolicyContext): void {
    this.applyYawAlignment(deltaTime, policy);

    const limits = this.tuning.tps.pitchRange;
    this.pitchTarget = clamp(this.pitchTarget, limits.min, limits.max);

    this.yawCurrent = expSmoothingAngle(
      this.yawCurrent,
      this.yawTarget,
      this.rotationLag,
      deltaTime
    );
    this.pitchCurrent = expSmoothing(
      this.pitchCurrent,
      this.pitchTarget,
      this.rotationLag,
      deltaTime
    );
    this.pitchCurrent = clamp(this.pitchCurrent, limits.min, limits.max);

    this.yawNode.rotation.y = this.yawCurrent;
    this.pitchNode.rotation.x = this.pitchCurrent;

    this.root.updateMatrixWorld(true);
    this.applyChaseCamera(deltaTime);
  }

  private tickFPV(deltaTime: number): void {
    const limits = this.tuning.fpv.pitchRange;
    this.pitchTarget = clamp(this.pitchTarget, limits.min, limits.max);

    this.yawCurrent = expSmoothingAngle(
      this.yawCurrent,
      this.yawTarget,
      this.rotationLag,
      deltaTime
    );
    this.pitchCurrent = expSmoothing(
      this.pitchCurrent,
      this.pitchTarget,
      this.rotationLag,
      deltaTime
    );
    this.pitchCurrent = clamp(this.pitchCurrent, limits.min, limits.max);

    this.yawNode.rotation.y = this.yawCurrent;
    this.pitchNode.rotation.x = this.pitchCurrent;

    this.root.updateMatrixWorld(true);
    this.applyFpvCamera(deltaTime);
  }

  private applyYawAlignment(deltaTime: number, policy: TpsPolicyContext): void {
    const { hasCamInput, isMoving, desiredForwardYaw, timeSinceCamInput } =
      policy;

    if (hasCamInput || !isMoving) {
      return;
    }

    if (timeSinceCamInput < this.tuning.tps.idleGraceSeconds) {
      return;
    }

    const targetYaw = normaliseAngle(desiredForwardYaw);
    const delta = shortestAngleDiff(this.yawTarget, targetYaw);
    if (Math.abs(delta) < EPSILON) {
      return;
    }

    const step = expBlend(0, delta, this.tuning.tps.yawAlignGain, deltaTime);
    this.yawTarget = normaliseAngle(this.yawTarget + step);
  }

  private applyChaseCamera(deltaTime: number): void {
    const desiredLength = Math.max(
      this.tuning.tps.minArmLength,
      this.armLengthTarget
    );

    const springOrigin = this.pitchNode.getWorldPosition(this.tempVecA);
    const desiredPoint = this.pitchNode.localToWorld(
      this.tempVecB.set(0, 0, desiredLength)
    );

    let allowedLength = desiredLength;
    if (this.scene) {
      allowedLength = this.collision.probe(
        springOrigin,
        desiredPoint,
        this.collisionIgnore
      );
    }

    allowedLength = clamp(
      allowedLength,
      this.tuning.tps.minArmLength,
      desiredLength
    );
    this.armLengthCurrent = expSmoothing(
      this.armLengthCurrent,
      allowedLength,
      this.tuning.tps.positionLagGain,
      deltaTime
    );

    this.camera.position.set(0, 0, this.armLengthCurrent);
  }

  private applyFpvCamera(deltaTime: number): void {
    this.armLengthTarget = this.tuning.fpv.forwardOffset;
    this.armLengthCurrent = expSmoothing(
      this.armLengthCurrent,
      this.armLengthTarget,
      this.tuning.fpv.positionLagGain,
      deltaTime
    );
    this.camera.position.set(0, 0, this.armLengthCurrent);
  }

  private applyModeSettings(mode: CameraMode): void {
    if (mode === "chase") {
      this.rotationLag = this.tuning.tps.rotationLagGain;
      this.positionLag = this.tuning.tps.positionLagGain;
      this.armLengthTarget = this.tuning.tps.armLength;
      this.pitchTarget = clamp(
        this.pitchTarget,
        this.tuning.tps.pitchRange.min,
        this.tuning.tps.pitchRange.max
      );
      if (Math.abs(this.pitchTarget) < EPSILON) {
        this.pitchTarget = DEFAULT_CHASE_PITCH;
      }
      this.pitchCurrent = this.pitchTarget;
      this.currentShoulderOffset.copy(this.tpsShoulderOffset);
    } else {
      this.rotationLag = this.tuning.fpv.rotationLagGain;
      this.positionLag = this.tuning.fpv.positionLagGain;
      this.armLengthTarget = this.tuning.fpv.forwardOffset;
      this.pitchTarget = clamp(
        this.pitchTarget,
        this.tuning.fpv.pitchRange.min,
        this.tuning.fpv.pitchRange.max
      );
      this.pitchCurrent = clamp(
        this.pitchCurrent,
        this.tuning.fpv.pitchRange.min,
        this.tuning.fpv.pitchRange.max
      );
      this.updateShoulderOffsetForMode();
    }
    this.armLengthCurrent = this.armLengthTarget;
    this.applyFov();
    this.lastDesiredForwardYaw = this.yawTarget;
  }

  private applyFov(): void {
    const next =
      this.mode === "chase" ? this.tuning.tps.fov : this.tuning.fpv.fov;
    if (Math.abs(this.camera.fov - next) > EPSILON) {
      this.camera.fov = next;
      this.camera.updateProjectionMatrix();
    }
  }

  private getPitchLimits(): { min: number; max: number } {
    return this.mode === "chase"
      ? this.tuning.tps.pitchRange
      : this.tuning.fpv.pitchRange;
  }

  private updateShoulderOffsetForMode(): void {
    if (this.mode === "chase") {
      this.currentShoulderOffset.copy(this.tpsShoulderOffset);
      return;
    }
    const eyeOffset = Math.max(
      this.eyeHeight - this.tuning.tps.pivotOffsetY,
      0.1
    );
    this.currentShoulderOffset.set(0, eyeOffset, 0);
  }

  private updateCharacterMetrics(target?: THREE.Object3D): void {
    if (!target) {
      this.characterHeight = 1.8;
      this.eyeHeight = this.characterHeight * this.tuning.fpv.eyeHeightFactor;
      return;
    }

    this.tempBox.setFromObject(target);
    if (!this.tempBox.isEmpty()) {
      this.tempBox.getSize(this.tempSize);
      if (this.tempSize.y > EPSILON) {
        this.characterHeight = this.tempSize.y;
      }
    }
    this.eyeHeight = Math.max(
      this.characterHeight * this.tuning.fpv.eyeHeightFactor,
      this.tuning.tps.pivotOffsetY + 0.3
    );
  }

  private updateCollisionIgnore(): void {
    this.collisionIgnore.clear();
    this.root.traverse((object) => {
      this.collisionIgnore.add(object);
    });
    if (this.followTarget) {
      this.followTarget.traverse((object) => {
        this.collisionIgnore.add(object);
      });
    }
  }

  private extractYaw(object: THREE.Object3D): number {
    object.getWorldDirection(this.tempVecC);
    return Math.atan2(this.tempVecC.x, -this.tempVecC.z);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function expSmoothing(
  current: number,
  target: number,
  gain: number,
  deltaTime: number
): number {
  return expBlend(current, target, gain, deltaTime);
}

function expSmoothingAngle(
  current: number,
  target: number,
  gain: number,
  deltaTime: number
): number {
  if (gain <= 0 || deltaTime <= 0) {
    return normaliseAngle(target);
  }
  const delta = shortestAngleDiff(current, target);
  if (Math.abs(delta) < EPSILON) {
    return normaliseAngle(target);
  }
  const step = expBlend(0, delta, gain, deltaTime);
  return normaliseAngle(current + step);
}

function expSmoothingVector(
  current: THREE.Vector3,
  target: THREE.Vector3,
  gain: number,
  deltaTime: number
): void {
  if (gain <= 0 || deltaTime <= 0) {
    current.copy(target);
    return;
  }
  const factor = 1 - Math.exp(-gain * deltaTime);
  current.lerp(target, factor);
}

function degToRad(value: number): number {
  return (Math.PI / 180) * value;
}

function shouldIgnore(
  object: THREE.Object3D,
  ignore: Set<THREE.Object3D>
): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (ignore.has(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export const cameraUtils = {
  normaliseAngle,
  shortestAngleDiff,
  expBlend,
};
