import * as THREE from 'three';

import { CameraRig } from '../camera';

export interface TouchCameraControlOpts {
  yawSpeed?: number;
  pitchSpeed?: number;
  pinchMode?: 'distance' | 'fov';
}

interface PointerState {
  x: number;
  y: number;
}

const toRadPerPixel = (deg: number): number => THREE.MathUtils.degToRad(deg);
const DEFAULT_YAW_SPEED = toRadPerPixel(0.15);
const DEFAULT_PITCH_SPEED = toRadPerPixel(0.18);
const FOV_MIN = 40;
const FOV_MAX = 80;
const DISTANCE_SETTLE_EPS = 0.02;
const FOV_SETTLE_EPS = 0.5;

export class TouchCameraControls {
  private rig: CameraRig | null = null;
  private readonly element: HTMLElement;

  private readonly yawSpeed: number;
  private readonly pitchSpeed: number;
  private readonly pinchMode: 'distance' | 'fov';

  private enabled = true;

  private readonly rotationDelta = new THREE.Vector2();
  private lookScale = 1;
  private invertY = false;

  private pointerId: number | null = null;
  private pointerLast: PointerState | null = null;
  private readonly activePointers = new Map<number, PointerState>();

  private pinchBaseline: number | null = null;
  private pinchRigStart: number | null = null;
  private pinchFovStart: number | null = null;
  private distanceTarget: number | null = null;
  private fovTarget: number | null = null;

  constructor(element: HTMLElement, opts: TouchCameraControlOpts = {}) {
    this.element = element;
    this.yawSpeed = opts.yawSpeed ?? DEFAULT_YAW_SPEED;
    this.pitchSpeed = opts.pitchSpeed ?? DEFAULT_PITCH_SPEED;
    this.pinchMode = opts.pinchMode ?? 'distance';

    this.element.style.touchAction = 'none';

    this.element.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    this.element.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    this.element.addEventListener('pointerup', this.handlePointerUp, { passive: false });
    this.element.addEventListener('pointercancel', this.handlePointerUp, { passive: false });
    this.element.addEventListener('pointerout', this.handlePointerUp, { passive: false });
  }

  attach(rig: CameraRig): void {
    this.rig = rig;
  }

  setSensitivity(degreesPerPixel: number): void {
    const baseDeg = THREE.MathUtils.radToDeg(DEFAULT_YAW_SPEED);
    const scale = baseDeg === 0 ? 1 : degreesPerPixel / baseDeg;
    this.lookScale = scale;
  }

  setInvertY(invert: boolean): void {
    this.invertY = invert;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerUp);
    this.element.removeEventListener('pointerout', this.handlePointerUp);
    this.resetPointers();
    this.rig = null;
  }

  setEnabled(on: boolean): void {
    if (this.enabled === on) {
      return;
    }
    this.enabled = on;
    if (!on) {
      this.resetPointers();
    }
  }

  update(dt: number): void {
    if (!this.rig) {
      return;
    }

    if (this.distanceTarget !== null) {
      const current = this.rig.getDistance();
      const alpha = THREE.MathUtils.clamp(dt * 12, 0, 1);
      const next = THREE.MathUtils.lerp(current, this.distanceTarget, alpha);
      this.rig.setDistance(next);
      if (Math.abs(next - this.distanceTarget) <= DISTANCE_SETTLE_EPS) {
        this.rig.setDistance(this.distanceTarget);
        this.distanceTarget = null;
      }
    }

    if (this.fovTarget !== null && this.rig) {
      const camera = this.rig.getCamera();
      const alpha = THREE.MathUtils.clamp(dt * 10, 0, 1);
      const next = THREE.MathUtils.lerp(camera.fov, this.fovTarget, alpha);
      camera.fov = next;
      camera.updateProjectionMatrix();
      if (Math.abs(next - this.fovTarget) <= FOV_SETTLE_EPS) {
        camera.fov = this.fovTarget;
        camera.updateProjectionMatrix();
        this.fovTarget = null;
      }
    }
  }

  consumeRotationDelta(): { x: number; y: number } {
    const delta = { x: this.rotationDelta.x, y: this.rotationDelta.y };
    this.rotationDelta.set(0, 0);
    return delta;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled || !this.isTouch(event) || !this.isRightSide(event)) {
      return;
    }

    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointerId === null) {
      this.pointerId = event.pointerId;
      this.pointerLast = { x: event.clientX, y: event.clientY };
    }

    if (this.activePointers.size === 2) {
      this.beginPinch();
    }

    event.preventDefault();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }

    const state = this.activePointers.get(event.pointerId)!;
    state.x = event.clientX;
    state.y = event.clientY;

    if (this.activePointers.size >= 2) {
      this.updatePinch();
      event.preventDefault();
      return;
    }

    if (event.pointerId === this.pointerId && this.pointerLast) {
      const dx = event.clientX - this.pointerLast.x;
      const dy = event.clientY - this.pointerLast.y;
      const yaw = dx * this.yawSpeed * this.lookScale;
      const pitch = dy * this.pitchSpeed * this.lookScale * (this.invertY ? 1 : -1);
      this.rotationDelta.x += yaw;
      this.rotationDelta.y += pitch;
      this.pointerLast = { x: event.clientX, y: event.clientY };
      event.preventDefault();
    }
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }

    this.activePointers.delete(event.pointerId);

    if (event.pointerId === this.pointerId) {
      this.pointerId = null;
      this.pointerLast = null;
    }

    if (this.activePointers.size < 2) {
      this.endPinch();
    }

    event.preventDefault();
  };

  private beginPinch(): void {
    if (!this.rig || this.activePointers.size < 2) {
      return;
    }

    const [a, b] = this.firstTwoPointers();
    if (!a || !b) {
      return;
    }

    this.pinchBaseline = distanceBetween(a, b);
    this.pinchRigStart = this.rig.getDistance();
    this.pinchFovStart = this.rig.getCamera().fov;
    this.distanceTarget = null;
    this.fovTarget = null;
    this.pointerLast = null;
  }

  private updatePinch(): void {
    if (!this.rig || !this.pinchBaseline || this.activePointers.size < 2) {
      return;
    }

    const [a, b] = this.firstTwoPointers();
    if (!a || !b) {
      return;
    }

    const currentDistance = distanceBetween(a, b);
    if (currentDistance <= 0 || this.pinchBaseline <= 0) {
      return;
    }

    const scale = currentDistance / this.pinchBaseline;

    if (this.pinchMode === 'fov') {
      const camera = this.rig.getCamera();
      const start = this.pinchFovStart ?? camera.fov;
      const target = THREE.MathUtils.clamp(start / scale, FOV_MIN, FOV_MAX);
      this.fovTarget = target;
    } else {
      const start = this.pinchRigStart ?? this.rig.getDistance();
      const target = start / scale;
      this.distanceTarget = target;
    }
  }

  private endPinch(): void {
    this.pinchBaseline = null;
    this.pinchRigStart = null;
    this.pinchFovStart = null;
    if (this.pointerId !== null) {
      const state = this.activePointers.get(this.pointerId);
      if (state) {
        this.pointerLast = { x: state.x, y: state.y };
      }
    }
  }

  private resetPointers(): void {
    this.pointerId = null;
    this.pointerLast = null;
    this.activePointers.clear();
    this.endPinch();
  }

  private firstTwoPointers(): [PointerState | null, PointerState | null] {
    const iter = this.activePointers.values();
    const a = iter.next().value ?? null;
    const b = iter.next().value ?? null;
    return [a, b];
  }

  private isTouch(event: PointerEvent): boolean {
    return event.pointerType === 'touch' || event.pointerType === 'pen';
  }

  private isRightSide(event: PointerEvent): boolean {
    const half = window.innerWidth * 0.5;
    return event.clientX >= half;
  }
}

function distanceBetween(a: PointerState, b: PointerState): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
