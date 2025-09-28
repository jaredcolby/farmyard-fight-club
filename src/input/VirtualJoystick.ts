import { Controls } from '../settings/controls';

export interface StickValue {
  x: number;
  y: number;
  magnitude: number;
}

export interface VirtualJoystickOptions {
  radius?: number;
  deadZone?: number;
  smoothing?: number;
  allowMouse?: boolean;
  name?: string;
  className?: string;
  blockStart?: (event: PointerEvent) => boolean;
}

const DEFAULT_VALUE: StickValue = { x: 0, y: 0, magnitude: 0 };

export class VirtualJoystick {
  readonly element: HTMLDivElement;

  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly radius: number;
  private readonly radiusSq: number;
  private readonly deadZone: number;
  private readonly smoothing: number;
  private readonly allowMouse: boolean;
  private readonly blockStart?: (event: PointerEvent) => boolean;

  private pointerId: number | null = null;
  private readonly origin = { x: 0, y: 0 };
  private readonly target = { x: 0, y: 0 };
  private readonly smooth = { x: 0, y: 0 };
  private readonly value: StickValue = { ...DEFAULT_VALUE };
  private active = false;

  constructor(private readonly container: HTMLElement, options: VirtualJoystickOptions = {}) {
    this.radius = options.radius ?? Controls.maxRadiusPx;
    this.radiusSq = this.radius * this.radius;
    this.deadZone = options.deadZone ?? Controls.deadZone;
    this.smoothing = options.smoothing ?? Controls.smoothing;
    this.allowMouse = options.allowMouse ?? false;
    this.blockStart = options.blockStart;

    this.element = document.createElement('div');
    this.element.className = 'dual-stick';
    if (options.className) {
      this.element.classList.add(options.className);
    }
    if (options.name) {
      this.element.dataset.stick = options.name;
    }

    this.base = document.createElement('div');
    this.base.className = 'dual-stick__base';
    this.knob = document.createElement('div');
    this.knob.className = 'dual-stick__knob';
    this.base.appendChild(this.knob);
    this.element.appendChild(this.base);
    this.container.appendChild(this.element);

    this.element.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    this.element.addEventListener('pointercancel', this.handlePointerUp, { passive: false });
    this.element.addEventListener('pointerup', this.handlePointerUp, { passive: false });

    this.reset();
  }

  dispose(): void {
    this.reset();
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointercancel', this.handlePointerUp);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.element.remove();
  }

  refreshLayout(): void {
    const rect = this.base.getBoundingClientRect();
    this.origin.x = rect.left + rect.width * 0.5;
    this.origin.y = rect.top + rect.height * 0.5;
  }

  update(): void {
    this.smooth.x += (this.target.x - this.smooth.x) * this.smoothing;
    this.smooth.y += (this.target.y - this.smooth.y) * this.smoothing;

    const magnitudeSq = this.smooth.x * this.smooth.x + this.smooth.y * this.smooth.y;
    if (magnitudeSq < this.deadZone * this.deadZone) {
      this.value.x = 0;
      this.value.y = 0;
      this.value.magnitude = 0;
      return;
    }

    this.value.x = this.smooth.x;
    this.value.y = this.smooth.y;
    this.value.magnitude = Math.min(Math.sqrt(magnitudeSq), 1);
  }

  reset(): void {
    this.pointerId = null;
    this.active = false;
    this.target.x = 0;
    this.target.y = 0;
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.knob.style.transform = 'translate3d(0, 0, 0)';
    this.element.classList.remove('dual-stick--active');
  }

  read(out: StickValue): StickValue;
  read(): StickValue;
  read(out?: StickValue): StickValue {
    if (!out) {
      return { x: this.value.x, y: this.value.y, magnitude: this.value.magnitude };
    }
    out.x = this.value.x;
    out.y = this.value.y;
    out.magnitude = this.value.magnitude;
    return out;
  }

  isActive(): boolean {
    return this.active;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.isAllowedPointer(event)) {
      return;
    }

    if (this.pointerId !== null && this.pointerId !== event.pointerId) {
      return;
    }

    if (this.blockStart && !this.blockStart(event)) {
      return;
    }

    this.refreshLayout();
    this.pointerId = event.pointerId;
    this.active = true;
    this.target.x = 0;
    this.target.y = 0;
    this.element.classList.add('dual-stick--active');
    if (!this.element.hasPointerCapture(event.pointerId)) {
      this.element.setPointerCapture(event.pointerId);
    }

    window.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    event.preventDefault();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - this.origin.x;
    const dy = event.clientY - this.origin.y;
    const distanceSq = dx * dx + dy * dy;

    let clampedX = dx;
    let clampedY = dy;
    if (distanceSq > this.radiusSq && distanceSq > 0) {
      const distance = Math.sqrt(distanceSq);
      const ratio = this.radius / distance;
      clampedX *= ratio;
      clampedY *= ratio;
    }

    this.knob.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;

    const normalisedX = clampedX / this.radius;
    const normalisedY = -clampedY / this.radius;
    const magnitudeSq = normalisedX * normalisedX + normalisedY * normalisedY;
    if (magnitudeSq < this.deadZone * this.deadZone) {
      this.target.x = 0;
      this.target.y = 0;
    } else {
      this.target.x = clamp(normalisedX, -1, 1);
      this.target.y = clamp(normalisedY, -1, 1);
    }

    event.preventDefault();
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }

    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    this.reset();
    event.preventDefault();
  };

  private isAllowedPointer(event: PointerEvent): boolean {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      return true;
    }

    if (event.pointerType === 'mouse') {
      return this.allowMouse;
    }

    return false;
  }
}

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};
