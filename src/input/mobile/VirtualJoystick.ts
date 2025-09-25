import { emptyVec2, Vec2 } from '../types';

interface VirtualJoystickOptions {
  radius?: number;
  deadzone?: number;
  smoothingAlpha?: number;
}

export class VirtualJoystick {
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly radius: number;
  private readonly deadzone: number;
  private readonly smoothingAlpha: number;

  private pointerId: number | null = null;
  private origin: Vec2 = emptyVec2();
  private target: Vec2 = emptyVec2();
  private smooth: Vec2 = emptyVec2();

  constructor(private readonly layer: HTMLElement, options: VirtualJoystickOptions = {}) {
    this.radius = options.radius ?? 60;
    this.deadzone = options.deadzone ?? 10;
    this.smoothingAlpha = options.smoothingAlpha ?? 0.25;

    this.base = document.createElement('div');
    this.base.className = 'touch-joystick-base';

    this.knob = document.createElement('div');
    this.knob.className = 'touch-joystick-knob';
    this.base.appendChild(this.knob);

    this.hide();
    this.layer.appendChild(this.base);

    this.layer.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    this.layer.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    this.layer.addEventListener('pointerup', this.handlePointerUp, { passive: false });
    this.layer.addEventListener('pointercancel', this.handlePointerUp, { passive: false });
    this.layer.addEventListener('pointerout', this.handlePointerOut, { passive: false });
  }

  dispose(): void {
    this.layer.removeEventListener('pointerdown', this.handlePointerDown);
    this.layer.removeEventListener('pointermove', this.handlePointerMove);
    this.layer.removeEventListener('pointerup', this.handlePointerUp);
    this.layer.removeEventListener('pointercancel', this.handlePointerUp);
    this.layer.removeEventListener('pointerout', this.handlePointerOut);
    this.base.remove();
  }

  tick(): void {
    this.smooth.x += (this.target.x - this.smooth.x) * this.smoothingAlpha;
    this.smooth.y += (this.target.y - this.smooth.y) * this.smoothingAlpha;
  }

  getValue(): Vec2 {
    return { x: this.smooth.x, y: this.smooth.y };
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null || !this.isTouch(event) || !this.isLeftSide(event)) {
      return;
    }

    this.pointerId = event.pointerId;
    this.origin = { x: event.clientX, y: event.clientY };
    this.target = emptyVec2();
    this.smooth = emptyVec2();
    this.show(event.clientX, event.clientY);

    event.preventDefault();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - this.origin.x;
    const dy = event.clientY - this.origin.y;
    const distance = Math.hypot(dx, dy);

    let clampedX = dx;
    let clampedY = dy;
    if (distance > this.radius) {
      const ratio = this.radius / distance;
      clampedX *= ratio;
      clampedY *= ratio;
    }

    const baseX = this.origin.x;
    const baseY = this.origin.y;
    this.setElementPosition(this.base, baseX, baseY);
    this.setElementPosition(this.knob, baseX + clampedX, baseY + clampedY);

    const outOfDeadzone = distance >= this.deadzone;
    if (!outOfDeadzone) {
      this.target = emptyVec2();
    } else {
      this.target = {
        x: clampedX / this.radius,
        y: -clampedY / this.radius
      };
    }

    event.preventDefault();
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }

    this.reset();
    event.preventDefault();
  };

  private handlePointerOut = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }

    this.reset();
  };

  private reset(): void {
    this.pointerId = null;
    this.target = emptyVec2();
    this.hide();
  }

  private hide(): void {
    this.base.style.display = 'none';
    this.base.classList.remove('active');
  }

  private show(x: number, y: number): void {
    this.base.style.display = 'block';
    this.base.classList.add('active');
    this.setElementPosition(this.base, x, y);
    this.setElementPosition(this.knob, x, y);
  }

  private setElementPosition(element: HTMLElement, x: number, y: number): void {
    element.style.setProperty('--touch-x', `${x}px`);
    element.style.setProperty('--touch-y', `${y}px`);
  }

  private isTouch(event: PointerEvent): boolean {
    return event.pointerType === 'touch' || event.pointerType === 'pen';
  }

  private isLeftSide(event: PointerEvent): boolean {
    return event.clientX <= window.innerWidth * 0.5;
  }
}
