import type { InputActions } from '../types';

const BUTTON_CONFIG: Array<{ key: keyof InputActions; label: string }> = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'jump', label: 'Jump' }
];

interface ButtonEntry {
  element: HTMLButtonElement;
  key: keyof InputActions;
  handleDown: (event: PointerEvent) => void;
  handleUp: (event: PointerEvent) => void;
}

export class ActionButtons {
  private readonly container: HTMLDivElement;
  private readonly states: InputActions = { primary: false, secondary: false, jump: false };
  private readonly activePointers = new Map<number, keyof InputActions>();
  private readonly buttons: ButtonEntry[] = [];

  constructor(private readonly layer: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'touch-actions';

    BUTTON_CONFIG.forEach(({ key, label }) => {
      const element = document.createElement('button');
      element.className = `touch-action touch-action-${key}`;
      element.textContent = label;

      const handleDown = (event: PointerEvent) => this.handlePointerDown(event, key);
      const handleUp = (event: PointerEvent) => this.handlePointerUp(event, key, element);

      element.addEventListener('pointerdown', handleDown, { passive: false });
      element.addEventListener('pointerup', handleUp, { passive: false });
      element.addEventListener('pointercancel', handleUp, { passive: false });
      element.addEventListener('pointerout', handleUp, { passive: false });

      this.container.appendChild(element);
      this.buttons.push({ element, key, handleDown, handleUp });
    });

    this.layer.appendChild(this.container);
  }

  dispose(): void {
    this.activePointers.clear();
    this.buttons.forEach(({ element, handleDown, handleUp }) => {
      element.removeEventListener('pointerdown', handleDown);
      element.removeEventListener('pointerup', handleUp);
      element.removeEventListener('pointercancel', handleUp);
      element.removeEventListener('pointerout', handleUp);
    });
    this.container.remove();
  }

  getState(): InputActions {
    return { ...this.states };
  }

  private handlePointerDown(event: PointerEvent, key: keyof InputActions): void {
    if (!this.isTouch(event)) {
      return;
    }

    this.activePointers.set(event.pointerId, key);
    this.states[key] = true;
    (event.currentTarget as HTMLElement).classList.add('active');
    navigator.vibrate?.(10);

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  private handlePointerUp(event: PointerEvent, key: keyof InputActions, element: HTMLElement): void {
    const storedKey = this.activePointers.get(event.pointerId) ?? key;
    this.activePointers.delete(event.pointerId);
    this.states[storedKey] = false;
    element.classList.remove('active');
    event.preventDefault();
  }

  private isTouch(event: PointerEvent): boolean {
    return event.pointerType === 'touch' || event.pointerType === 'pen';
  }
}
