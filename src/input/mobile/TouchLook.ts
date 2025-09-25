import { Vec2 } from '../types';

interface TouchLookOptions {
  sensitivity?: number;
  invertY?: boolean;
}

export class TouchLook {
  private pointerId: number | null = null;
  private lastPoint: Vec2 | null = null;
  private accumulated: Vec2 = { x: 0, y: 0 };

  private sensitivity: number;
  private invertY: boolean;

  constructor(private readonly layer: HTMLElement, options: TouchLookOptions = {}) {
    this.sensitivity = options.sensitivity ?? 0.15;
    this.invertY = options.invertY ?? false;

    this.layer.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    this.layer.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    this.layer.addEventListener('pointerup', this.handlePointerUp, { passive: false });
    this.layer.addEventListener('pointercancel', this.handlePointerUp, { passive: false });
    this.layer.addEventListener('pointerout', this.handlePointerUp, { passive: false });
  }

  dispose(): void {
    this.layer.removeEventListener('pointerdown', this.handlePointerDown);
    this.layer.removeEventListener('pointermove', this.handlePointerMove);
    this.layer.removeEventListener('pointerup', this.handlePointerUp);
    this.layer.removeEventListener('pointercancel', this.handlePointerUp);
    this.layer.removeEventListener('pointerout', this.handlePointerUp);
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  setInvertY(invert: boolean): void {
    this.invertY = invert;
  }

  consumeDelta(): Vec2 {
    const delta = { ...this.accumulated };
    this.accumulated = { x: 0, y: 0 };
    return delta;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null || !this.isTouch(event) || !this.isRightSide(event)) {
      return;
    }

    this.pointerId = event.pointerId;
    this.lastPoint = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId || !this.lastPoint) {
      return;
    }

    const deltaX = event.clientX - this.lastPoint.x;
    const deltaY = event.clientY - this.lastPoint.y;

    const yaw = toRadians(deltaX * this.sensitivity);
    const pitch = toRadians(deltaY * this.sensitivity) * (this.invertY ? 1 : -1);

    this.accumulated.x += yaw;
    this.accumulated.y += pitch;

    this.lastPoint = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }

    this.pointerId = null;
    this.lastPoint = null;
    event.preventDefault();
  };

  private isTouch(event: PointerEvent): boolean {
    return event.pointerType === 'touch' || event.pointerType === 'pen';
  }

  private isRightSide(event: PointerEvent): boolean {
    return event.clientX >= window.innerWidth * 0.5;
  }
}

function toRadians(degrees: number): number {
  return (Math.PI / 180) * degrees;
}
