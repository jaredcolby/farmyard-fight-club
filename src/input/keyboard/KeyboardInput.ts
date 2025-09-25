import { createEmptyInputState, InputState } from '../types';

const TURN_INCREMENT = 0.03;

export type KeyboardToggleCamera = () => void;

export class KeyboardInput {
  private readonly trackedKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'c', ' ']);
  private readonly state = new Map<string, boolean>();
  private handleKeyDownBound = (event: KeyboardEvent) => this.handleKeyDown(event);
  private handleKeyUpBound = (event: KeyboardEvent) => this.handleKeyUp(event);

  constructor(private readonly onToggleCamera: KeyboardToggleCamera) {}

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

    if (this.state.get(event.key)) {
      return;
    }

    this.state.set(event.key, true);

    if (event.key === 'c') {
      this.onToggleCamera();
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.trackedKeys.has(event.key)) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    this.state.set(event.key, false);
  }

  private isPressed(key: string): boolean {
    return this.state.get(key) ?? false;
  }
}
