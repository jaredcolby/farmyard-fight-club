import * as THREE from 'three';

export type RigOpts = {
  minPitchDeg?: number;
  maxPitchDeg?: number;
  minDist?: number;
  maxDist?: number;
  initialDist?: number;
};

const degToRad = (deg: number): number => (deg * Math.PI) / 180;
const ORIGIN = new THREE.Vector3(0, 0, 0);

export class CameraRig extends THREE.Group {
  private readonly yawNode = new THREE.Group();
  private readonly pitchNode = new THREE.Group();

  private readonly camera: THREE.PerspectiveCamera;

  private readonly minPitch: number;
  private readonly maxPitch: number;
  private readonly minDist: number;
  private readonly maxDist: number;

  private distance: number;
  private pitch: number;

  private readonly targetWorld = new THREE.Vector3();
  private readonly cameraWorld = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, opts: RigOpts = {}) {
    super();

    const minPitchDeg = opts.minPitchDeg ?? 5;
    const maxPitchDeg = opts.maxPitchDeg ?? 85;
    const minDist = opts.minDist ?? 2;
    const maxDist = opts.maxDist ?? 12;
    const initialDist = THREE.MathUtils.clamp(opts.initialDist ?? 6, minDist, maxDist);

    this.camera = camera;

    this.minPitch = degToRad(minPitchDeg);
    this.maxPitch = degToRad(maxPitchDeg);
    this.minDist = minDist;
    this.maxDist = maxDist;
    this.distance = initialDist;

    const initialPitch = THREE.MathUtils.clamp((this.minPitch + this.maxPitch) * 0.5, this.minPitch, this.maxPitch);
    this.pitch = initialPitch;

    this.add(this.yawNode);
    this.yawNode.add(this.pitchNode);
    this.pitchNode.add(this.camera);

    this.pitchNode.rotation.x = this.pitch;
    this.camera.position.set(0, 0, this.distance);
    this.camera.lookAt(ORIGIN);
  }

  setTarget(v: THREE.Vector3): void {
    this.position.copy(v);
  }

  rotate(yawDeltaRad: number, pitchDeltaRad: number): void {
    if (yawDeltaRad !== 0) {
      this.yawNode.rotation.y += yawDeltaRad;
    }

    if (pitchDeltaRad !== 0) {
      this.setPitch(this.pitch + pitchDeltaRad);
    }
  }

  setDistance(d: number): void {
    const clamped = THREE.MathUtils.clamp(d, this.minDist, this.maxDist);
    if (clamped === this.distance) {
      return;
    }
    this.distance = clamped;
    this.camera.position.set(0, 0, this.distance);
    this.camera.lookAt(ORIGIN);
  }

  getDistance(): number {
    return this.distance;
  }

  getPitch(): number {
    return this.pitch;
  }

  setPitch(pitchRad: number): void {
    const clamped = THREE.MathUtils.clamp(pitchRad, this.minPitch, this.maxPitch);
    if (clamped === this.pitch) {
      return;
    }
    this.pitch = clamped;
    this.pitchNode.rotation.x = this.pitch;
  }

  getYaw(): number {
    return this.yawNode.rotation.y;
  }

  setYaw(yawRad: number): void {
    this.yawNode.rotation.y = yawRad;
  }

  enforceGround(groundY = 0, eps = 0.1): void {
    const minY = groundY + eps;
    this.camera.getWorldPosition(this.cameraWorld);
    if (this.cameraWorld.y >= minY) {
      return;
    }

    this.getWorldPosition(this.targetWorld);
    const needed = minY - this.targetWorld.y;
    if (needed <= 0) {
      return;
    }

    const safePitch = Math.asin(THREE.MathUtils.clamp(needed / this.distance, -1, 1));
    if (!Number.isNaN(safePitch)) {
      this.setPitch(Math.max(this.pitch, safePitch, this.minPitch));
    }

    this.camera.getWorldPosition(this.cameraWorld);
    if (this.cameraWorld.y >= minY) {
      return;
    }

    let sinPitch = Math.sin(this.pitch);
    if (sinPitch > 0) {
      const requiredDistance = needed / sinPitch;
      if (requiredDistance > this.distance) {
        this.setDistance(requiredDistance);
      }
    }

    this.camera.getWorldPosition(this.cameraWorld);
    if (this.cameraWorld.y >= minY) {
      return;
    }

    if (this.pitch < this.maxPitch) {
      this.setPitch(this.maxPitch);
      this.camera.getWorldPosition(this.cameraWorld);
      if (this.cameraWorld.y >= minY) {
        return;
      }
    }

    sinPitch = Math.sin(this.pitch);
    if (sinPitch > 0) {
      const requiredDistance = needed / sinPitch;
      if (requiredDistance > this.distance) {
        this.setDistance(requiredDistance);
      }
    }
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }
}
