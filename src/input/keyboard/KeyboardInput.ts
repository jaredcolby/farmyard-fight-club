import { createEmptyInputState, InputState } from "../types";

const TURN_INCREMENT = 0.03;
const SPACE_KEY = " ";

export type KeyboardToggleCamera = () => void;
export type KeyboardToggleGui = () => void;

export class KeyboardInput {
  private readonly trackedKeys = new Set([
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
    "w",
    "a",
    "s",
    "d",
    "q",
    "e",
    "c",
    "g",
    SPACE_KEY,
  ]);
  private readonly state = new Map<string, boolean>();
  private handleKeyDownBound = (event: KeyboardEvent) => this.handleKeyDown(event);
  private handleKeyUpBound = (event: KeyboardEvent) => this.handleKeyUp(event);

  constructor(
    private readonly onToggleCamera: KeyboardToggleCamera,
    private readonly onToggleGui: KeyboardToggleGui
  ) {}

  register(): void {
    document.addEventListener("keydown", this.handleKeyDownBound);
    document.addEventListener("keyup", this.handleKeyUpBound);
  }

  dispose(): void {
    document.removeEventListener("keydown", this.handleKeyDownBound);
    document.removeEventListener("keyup", this.handleKeyUpBound);
  }

  read(): InputState {
    const input = createEmptyInputState();
    let moveX = 0;
    let moveY = 0;
    let turn = 0;

    if (this.isPressed("arrowup") || this.isPressed("w")) {
      moveY += 1;
    }

    if (this.isPressed("arrowdown") || this.isPressed("s")) {
      moveY -= 1;
    }

    if (this.isPressed("arrowleft") || this.isPressed("a")) {
      moveX -= 1;
    }

    if (this.isPressed("arrowright") || this.isPressed("d")) {
      moveX += 1;
    }

    if (this.isPressed("q")) {
      turn += TURN_INCREMENT;
    }

    if (this.isPressed("e")) {
      turn -= TURN_INCREMENT;
    }

    const magnitude = Math.hypot(moveX, moveY);
    if (magnitude > 1) {
      moveX /= magnitude;
      moveY /= magnitude;
    }

    input.move.x = moveX;
    input.move.y = moveY;
    input.turn = turn;

    if (this.isPressed(SPACE_KEY)) {
      input.actions.jump = true;
    }

    return input;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const key = this.normaliseKey(event.key);
    if (!this.trackedKeys.has(key)) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    if (key === "c") {
      if (!event.repeat) {
        this.onToggleCamera();
      }
      return;
    }

    if (key === "g") {
      if (!event.repeat) {
        this.onToggleGui();
      }
      return;
    }

    this.state.set(key, true);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const key = this.normaliseKey(event.key);
    if (!this.trackedKeys.has(key)) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    if (key === "c" || key === "g") {
      return;
    }

    this.state.set(key, false);
  }

  private isPressed(key: string): boolean {
    return this.state.get(key) ?? false;
  }

  private normaliseKey(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  }
}
