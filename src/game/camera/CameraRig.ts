import * as THREE from 'three';

import type { CameraMode } from '../../settings/controls';

const PI2 = Math.PI * 2;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normaliseAngle = (angle: number): number => {
  let result = angle % PI2;
  if (result <= -Math.PI) {
    result += PI2;
  } else if (result > Math.PI) {
    result -= PI2;
  }
  return result;
};

const shortestAngleDiff = (from: number, to: number): number => {
  const difference = normaliseAngle(to - from);
  return difference;
};

export class CameraRig {
  private readonly root = new THREE.Object3D();
  private readonly yawNode = new THREE.Object3D();
  private readonly pitchNode = new THREE.Object3D();
  private readonly camera: THREE.PerspectiveCamera;

  private readonly tempVec = new THREE.Vector3();
  private readonly targetPosition = new THREE.Vector3();

  private followTarget: THREE.Object3D | null = null;

  private yaw = 0;
  private pitch = -0.22;
  private mode: CameraMode = 'chase';

  private readonly chase = {
    height: 4.2,
    distance: 9,
    pitchPreferred: THREE.MathUtils.degToRad(-12),
    pitchMin: THREE.MathUtils.degToRad(-75),
    pitchMax: THREE.MathUtils.degToRad(35)
  };

  private readonly fpv = {
    height: 1.65,
    forwardOffset: 0.18,
    pitchMin: THREE.MathUtils.degToRad(-85),
    pitchMax: THREE.MathUtils.degToRad(85)
  };

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.root.name = 'CameraRigRoot';
    this.yawNode.name = 'CameraRigYaw';
    this.pitchNode.name = 'CameraRigPitch';

    this.pitchNode.add(this.camera);
    this.yawNode.add(this.pitchNode);
    this.root.add(this.yawNode);

    this.configureForMode('chase');
  }

  attachTo(scene: THREE.Scene): void {
    if (!scene.children.includes(this.root)) {
      scene.add(this.root);
    }
  }

  setFollowTarget(target: THREE.Object3D): void {
    this.followTarget = target;
    target.getWorldPosition(this.targetPosition);
    this.root.position.copy(this.targetPosition);
  }

  setMode(mode: CameraMode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.configureForMode(mode);
  }

  getMode(): CameraMode {
    return this.mode;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getYaw(): number {
    return this.yaw;
  }

  getPitch(): number {
    return this.pitch;
  }

  setYaw(value: number): void {
    this.yaw = normaliseAngle(value);
    this.yawNode.rotation.y = this.yaw;
  }

  addYaw(delta: number): void {
    if (delta === 0) {
      return;
    }
    this.setYaw(this.yaw + delta);
  }

  setPitch(value: number): void {
    const limits = this.getPitchLimits();
    this.pitch = clamp(value, limits.min, limits.max);
    this.pitchNode.rotation.x = this.pitch;
  }

  addPitch(delta: number): void {
    if (delta === 0) {
      return;
    }
    this.setPitch(this.pitch + delta);
  }

  alignYawToObject(object: THREE.Object3D, gain: number, deltaTime: number): void {
    const targetYaw = this.extractYaw(object);
    const delta = shortestAngleDiff(this.yaw, targetYaw);
    const step = delta * (1 - Math.exp(-gain * deltaTime));
    if (Math.abs(step) < 1e-5) {
      this.setYaw(targetYaw);
    } else {
      this.addYaw(step);
    }
  }

  alignYawTo(angle: number, gain: number, deltaTime: number): void {
    const delta = shortestAngleDiff(this.yaw, angle);
    const step = delta * (1 - Math.exp(-gain * deltaTime));
    if (Math.abs(step) < 1e-5) {
      this.setYaw(angle);
    } else {
      this.addYaw(step);
    }
  }

  alignPitchTo(value: number, gain: number, deltaTime: number): void {
    const delta = value - this.pitch;
    const step = delta * (1 - Math.exp(-gain * deltaTime));
    if (Math.abs(step) < 1e-5) {
      this.setPitch(value);
    } else {
      this.addPitch(step);
    }
  }

  update(deltaTime: number): void {
    if (this.followTarget) {
      this.followTarget.getWorldPosition(this.targetPosition);
      this.root.position.lerp(this.targetPosition, clamp(deltaTime * 10, 0, 1));
    }

    if (this.mode === 'chase') {
      this.pitchNode.position.set(0, this.chase.height, 0);
      this.camera.position.set(0, 0, this.chase.distance);
    } else {
      this.pitchNode.position.set(0, this.fpv.height, 0);
      this.camera.position.set(0, 0, this.fpv.forwardOffset);
    }

    this.yawNode.rotation.y = this.yaw;
    this.pitchNode.rotation.x = this.pitch;
  }

  getForward(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, -1);
    out.applyQuaternion(this.camera.quaternion);
    return out.normalize();
  }

  private configureForMode(mode: CameraMode): void {
    if (mode === 'chase') {
      this.setPitch(this.chase.pitchPreferred);
    } else {
      this.setPitch(0);
    }
  }

  private getPitchLimits(): { min: number; max: number } {
    return this.mode === 'chase'
      ? { min: this.chase.pitchMin, max: this.chase.pitchMax }
      : { min: this.fpv.pitchMin, max: this.fpv.pitchMax };
  }

  private extractYaw(object: THREE.Object3D): number {
    object.getWorldDirection(this.tempVec);
    const direction = this.tempVec;
    return Math.atan2(direction.x, direction.z);
  }
}

export const cameraUtils = {
  normaliseAngle,
  shortestAngleDiff
};
