import { KeyboardInput } from './keyboard/KeyboardInput';
import { InputState } from './types';

export class InputManager {
  private readonly keyboard: KeyboardInput;

  constructor(private readonly toggleCamera: () => void, private readonly toggleGui: () => void) {
    this.keyboard = new KeyboardInput(() => this.toggleCamera(), () => this.toggleGui());
  }

  register(): void {
    this.keyboard.register();
  }

  dispose(): void {
    this.keyboard.dispose();
  }

  read(): InputState {
    return this.keyboard.read();
  }
}
