import type { GUI, GUIController } from 'dat.gui';

import { KeyboardInput } from './keyboard/KeyboardInput';
import { MobileControls } from './mobile/mobileControls';
import { InputState, mergeInputStates, MobileControlSettings } from './types';

interface MotionActions {
  enableMotion: () => Promise<void>;
  calibrate: () => void;
}

export class InputManager {
  private readonly keyboard: KeyboardInput;
  private readonly mobile: MobileControls;
  private readonly guiSettings: MobileControlSettings;
  private readonly controllers: Partial<Record<keyof MobileControlSettings | 'gyroAimEnabled' | 'tiltMode', GUIController>> = {};

  constructor(private readonly toggleCamera: () => void) {
    this.keyboard = new KeyboardInput(() => this.toggleCamera());
    this.mobile = new MobileControls();
    this.guiSettings = this.mobile.getSettings();
  }

  register(): void {
    this.keyboard.register();
    if (this.mobile.canEnable()) {
      this.mobile.mount();
    }
  }

  dispose(): void {
    this.keyboard.dispose();
    this.mobile.dispose();
  }

  read(): InputState {
    const state = this.keyboard.read();
    if (this.mobile.canEnable()) {
      const mobileState = this.mobile.read();
      mergeInputStates(state, mobileState);
    }
    return state;
  }

  attachToGui(gui: GUI): void {
    if (!this.mobile.canEnable()) {
      return;
    }

    const folder = gui.addFolder('Mobile Controls');
    folder.close();

    this.controllers.lookSensitivity = folder
      .add(this.guiSettings, 'lookSensitivity', 0.05, 0.4, 0.01)
      .name('Look Sensitivity')
      .onChange((value: number) => this.syncSetting({ lookSensitivity: value }));

    this.controllers.invertY = folder
      .add(this.guiSettings, 'invertY')
      .name('Invert Y')
      .onChange((value: boolean) => this.syncSetting({ invertY: value }));

    this.controllers.gyroAimEnabled = folder
      .add(this.guiSettings, 'gyroAimEnabled')
      .name('Gyro Aim')
      .onChange(async (value: boolean) => this.handleGyroToggle(value));

    this.controllers.gyroAimSensitivity = folder
      .add(this.guiSettings, 'gyroAimSensitivity', 0.005, 0.06, 0.005)
      .name('Gyro Sensitivity')
      .onChange((value: number) => this.syncSetting({ gyroAimSensitivity: value }));

    this.controllers.tiltMode = folder
      .add(this.guiSettings, 'tiltMode', ['off', 'tiltAssist', 'tiltMove'])
      .name('Tilt Mode')
      .onChange(async (value: MobileControlSettings['tiltMode']) => this.handleTiltMode(value));

    this.controllers.tiltSensitivity = folder
      .add(this.guiSettings, 'tiltSensitivity', 0.2, 1.2, 0.05)
      .name('Tilt Sensitivity')
      .onChange((value: number) => this.syncSetting({ tiltSensitivity: value }));

    this.controllers.tiltDeadzone = folder
      .add(this.guiSettings, 'tiltDeadzone', 0, 10, 0.5)
      .name('Tilt Deadzone (°)')
      .onChange((value: number) => this.syncSetting({ tiltDeadzone: value }));

    const actions: MotionActions = {
      enableMotion: () => this.mobile.requestMotionPermission().then(granted => {
        if (!granted) {
          this.syncSetting({ gyroAimEnabled: false, tiltMode: 'off' });
          this.refreshControllers();
        }
      }),
      calibrate: () => {
        this.mobile.calibrate();
      }
    };

    folder.add(actions, 'enableMotion').name('Enable Motion Controls');
    folder.add(actions, 'calibrate').name('Calibrate Neutral Pose');
  }

  private async handleGyroToggle(enabled: boolean): Promise<void> {
    if (enabled) {
      const granted = await this.mobile.requestMotionPermission();
      if (!granted) {
        this.syncSetting({ gyroAimEnabled: false });
        this.refreshControllers();
        return;
      }
    }
    this.syncSetting({ gyroAimEnabled: enabled });
  }

  private async handleTiltMode(mode: MobileControlSettings['tiltMode']): Promise<void> {
    if (mode !== 'off') {
      const granted = await this.mobile.requestMotionPermission();
      if (!granted) {
        this.syncSetting({ tiltMode: 'off' });
        this.refreshControllers();
        return;
      }
    }
    this.syncSetting({ tiltMode: mode });
  }

  private syncSetting(partial: Partial<MobileControlSettings>): void {
    const next = this.mobile.updateSettings(partial);
    Object.assign(this.guiSettings, next);
  }

  private refreshControllers(): void {
    Object.values(this.controllers).forEach(controller => controller?.updateDisplay());
  }
}
