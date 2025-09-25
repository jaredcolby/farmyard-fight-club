import { createEmptyInputState, InputState } from '../types';

const TURN_INCREMENT = 0.03;

export type KeyboardToggleCamera = () => void;
export type KeyboardToggleGui = () => void;

export class KeyboardInput {
  private readonly trackedKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'c', 'g', ' ']);
  private readonly state = new Map<string, boolean>();
  private handleKeyDownBound = (event: KeyboardEvent) => this.handleKeyDown(event);
  private handleKeyUpBound = (event: KeyboardEvent) => this.handleKeyUp(event);

  constructor(private readonly onToggleCamera: KeyboardToggleCamera, private readonly onToggleGui: KeyboardToggleGui) {}

  register(): void {
    document.addEventListener('keydown', this.handleKeyDownBound);
    document.addEventListener('keyup', this.handleKeyUpBound);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.handleKeyDownBound);
    document.removeEventListener('keyup', this.handleKeyUpBound);
  }

  read(): InputState {
    const input = createEmptyInputState();

    if (this.isPressed('ArrowUp')) {
      input.move.y += 1;
    }

    if (this.isPressed('ArrowDown')) {
      input.move.y -= 1;
    }

    if (this.isPressed('ArrowLeft')) {
      input.lookDelta.x += TURN_INCREMENT;
    }

    if (this.isPressed('ArrowRight')) {
      input.lookDelta.x -= TURN_INCREMENT;
    }

    if (this.isPressed(' ')) {
      input.actions.jump = true;
    }

    return input;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.trackedKeys.has(event.key)) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    if (event.key === 'c') {
      if (!event.repeat) {
        this.onToggleCamera();
      }
      return;
    }

    if (event.key === 'g') {
      if (!event.repeat) {
        this.onToggleGui();
      }
      return;
    }

    if (this.state.get(event.key)) {
      return;
    }

    this.state.set(event.key, true);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.trackedKeys.has(event.key)) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    if (event.key === 'c' || event.key === 'g') {
      return;
    }

    this.state.set(event.key, false);
  }

  private isPressed(key: string): boolean {
    return this.state.get(key) ?? false;
  }
}
