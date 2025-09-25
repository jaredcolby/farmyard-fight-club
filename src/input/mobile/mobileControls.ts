import { createEmptyInputState, defaultMobileSettings, InputState, MobileControlSettings } from '../types';
import { ActionButtons } from './ActionButtons';
import { TouchLook } from './TouchLook';
import { VirtualJoystick } from './VirtualJoystick';
import { MotionController } from '../motion/MotionController';
import { SensorInput } from '../motion/SensorInput';

const STORAGE_KEY = 'ffc-mobile-controls';

interface MobileControlsOptions {
  onToggleCamera?: () => void;
}

interface MobileControlsContext {
  layer: HTMLDivElement;
  joystick: VirtualJoystick;
  look: TouchLook;
  actions: ActionButtons;
  motion: MotionController;
  cameraButton: HTMLButtonElement | null;
}

export class MobileControls {
  private context: MobileControlsContext | null = null;
  private settings: MobileControlSettings = defaultMobileSettings();

  constructor(private readonly root: HTMLElement = document.body, private readonly options: MobileControlsOptions = {}) {
    this.settings = { ...defaultMobileSettings(), ...this.loadSettings() };
  }

  canEnable(): boolean {
    return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  }

  mount(): void {
    if (this.context || !this.canEnable()) {
      return;
    }

    const layer = document.createElement('div');
    layer.id = 'touch-layer';
    layer.className = 'touch-layer';

    const joystick = new VirtualJoystick(layer, {
      radius: 60,
      deadzone: 10,
      smoothingAlpha: 0.25
    });

    const look = new TouchLook(layer, {
      sensitivity: this.settings.lookSensitivity,
      invertY: this.settings.invertY
    });

    const actions = new ActionButtons(layer);

    const cameraButton = this.createCameraToggle(layer);

    const motion = new MotionController(new SensorInput());
    motion.setGyro(this.settings.gyroAimEnabled, this.settings.gyroAimSensitivity);
    motion.setTiltOptions(this.settings.tiltSensitivity, this.settings.tiltDeadzone);
    motion.setMode(this.settings.tiltMode);

    this.root.appendChild(layer);
    this.context = { layer, joystick, look, actions, motion, cameraButton };
    this.applySettings();
  }

  async requestMotionPermission(): Promise<boolean> {
    if (!this.context) {
      return false;
    }
    const success = await this.context.motion.enable();
    if (success) {
      this.context.motion.calibrate();
    }
    return success;
  }

  calibrate(): void {
    this.context?.motion.calibrate();
  }

  dispose(): void {
    if (!this.context) {
      return;
    }
    this.context.joystick.dispose();
    this.context.look.dispose();
    this.context.actions.dispose();
    this.context.motion.disable();
    this.context.cameraButton?.remove();
    this.context.layer.remove();
    this.context = null;
  }

  read(): InputState {
    const state = createEmptyInputState();
    if (!this.context) {
      return state;
    }

    this.context.joystick.tick();
    const move = this.context.joystick.getValue();
    state.move.x += move.x;
    state.move.y += move.y;

    const lookDelta = this.context.look.consumeDelta();
    state.lookDelta.x += lookDelta.x;
    state.lookDelta.y += lookDelta.y;

    const actions = this.context.actions.getState();
    state.actions.primary = state.actions.primary || actions.primary;
    state.actions.secondary = state.actions.secondary || actions.secondary;
    state.actions.jump = state.actions.jump || actions.jump;

    return this.context.motion.apply(state);
  }

  getSettings(): MobileControlSettings {
    return { ...this.settings };
  }

  updateSettings(update: Partial<MobileControlSettings>): MobileControlSettings {
    this.settings = { ...this.settings, ...update };
    this.persistSettings();
    this.applySettings();
    return this.getSettings();
  }

  private applySettings(): void {
    if (!this.context) {
      return;
    }

    this.context.look.setSensitivity(this.settings.lookSensitivity);
    this.context.look.setInvertY(this.settings.invertY);
    this.context.motion.setGyro(this.settings.gyroAimEnabled, this.settings.gyroAimSensitivity);
    this.context.motion.setTiltOptions(this.settings.tiltSensitivity, this.settings.tiltDeadzone);
    this.context.motion.setMode(this.settings.tiltMode);

    const wantMotion = this.settings.gyroAimEnabled || this.settings.tiltMode !== 'off';
    if (!wantMotion) {
      this.context.motion.disable();
    }
  }

  private loadSettings(): Partial<MobileControlSettings> {
    if (typeof localStorage === 'undefined') {
      return {};
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed ?? {};
    } catch (error) {
      console.warn('Failed to load mobile control settings', error);
      return {};
    }
  }

  private persistSettings(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn('Failed to persist mobile control settings', error);
    }
  }

  private createCameraToggle(layer: HTMLElement): HTMLButtonElement | null {
    if (!this.options.onToggleCamera) {
      return null;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'touch-utility touch-camera-toggle';
    button.setAttribute('aria-label', 'Toggle Camera View');
    button.innerHTML = '<span>Cam</span>';

    const handler = (event: PointerEvent) => {
      event.stopPropagation();
      event.preventDefault();
      this.options.onToggleCamera?.();
    };

    button.addEventListener('pointerdown', handler, { passive: false });
    button.addEventListener('click', event => {
      event.stopPropagation();
      event.preventDefault();
    });

    layer.appendChild(button);
    return button;
  }
}
