import { createEmptyInputState, defaultMobileSettings, InputState, MobileControlSettings } from '../types';
import { ActionButtons } from './ActionButtons';
import { VirtualJoystick } from './VirtualJoystick';
import { MotionController } from '../motion/MotionController';
import { SensorInput } from '../motion/SensorInput';

const STORAGE_KEY = 'ffc-mobile-controls';

interface MobileControlsOptions {
  onToggleCamera?: () => void;
  onToggleMenu?: () => void;
}

interface UtilityButton {
  element: HTMLButtonElement;
  handler: (event: PointerEvent) => void;
}

interface MobileControlsContext {
  layer: HTMLDivElement;
  joystick: VirtualJoystick;
  actions: ActionButtons;
  motion: MotionController;
  utilities: {
    container: HTMLDivElement;
    buttons: UtilityButton[];
  } | null;
  cameraButton: UtilityButton | null;
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

    const actions = new ActionButtons(layer);

    const utilities = this.createUtilities();
    const utilityButtons: UtilityButton[] = [];
    const cameraButton = this.createUtilityButton(utilities, 'Orbit', 'camera-toggle', this.options.onToggleCamera);
    if (cameraButton) {
      utilityButtons.push(cameraButton);
    }
    const menuButton = this.createUtilityButton(utilities, 'Menu', 'menu-toggle', this.options.onToggleMenu);
    if (menuButton) {
      utilityButtons.push(menuButton);
    }

    if (utilityButtons.length === 0) {
      utilities.remove();
    }

    const motion = new MotionController(new SensorInput());
    motion.setGyro(this.settings.gyroAimEnabled, this.settings.gyroAimSensitivity);
    motion.setTiltOptions(this.settings.tiltSensitivity, this.settings.tiltDeadzone);
    motion.setMode(this.settings.tiltMode);

    this.root.appendChild(layer);
    this.context = {
      layer,
      joystick,
      actions,
      motion,
      utilities: utilityButtons.length ? { container: utilities, buttons: utilityButtons } : null,
      cameraButton: cameraButton ?? null
    };
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
    this.context.actions.dispose();
    this.context.motion.disable();
    if (this.context.utilities) {
      this.context.utilities.buttons.forEach(({ element, handler }) => {
        element.removeEventListener('pointerdown', handler);
      });
      this.context.utilities.container.remove();
    }
    this.context.layer.remove();
    this.context = null;
  }

  setInteractive(interactive: boolean): void {
    if (!this.context) {
      return;
    }

    if (interactive) {
      this.context.layer.classList.remove('touch-layer--disabled');
    } else {
      this.context.layer.classList.add('touch-layer--disabled');
    }
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

    const actions = this.context.actions.getState();
    state.actions.primary = state.actions.primary || actions.primary;
    state.actions.secondary = state.actions.secondary || actions.secondary;
    state.actions.jump = state.actions.jump || actions.jump;

    return this.context.motion.apply(state);
  }

  getSettings(): MobileControlSettings {
    return { ...this.settings };
  }

  getLayer(): HTMLDivElement | null {
    return this.context?.layer ?? null;
  }

  setCameraButtonLabel(label: string): void {
    if (!this.context?.cameraButton) {
      return;
    }
    const { element } = this.context.cameraButton;
    element.setAttribute('aria-label', label);
    const span = element.querySelector('span');
    if (span) {
      span.textContent = label;
    }
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

  private createUtilities(): HTMLDivElement {
    const utilities = document.createElement('div');
    utilities.className = 'touch-utilities';
    document.body.appendChild(utilities);
    return utilities;
  }

  private createUtilityButton(
    container: HTMLElement,
    label: string,
    modifier: string,
    action?: () => void
  ): UtilityButton | null {
    if (!action) {
      return null;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-utility touch-${modifier}`;
    button.setAttribute('aria-label', label);
    button.innerHTML = `<span>${label}</span>`;

    const handler = (event: PointerEvent) => {
      if (!event.isPrimary) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      action();
    };

    button.addEventListener('pointerdown', handler, { passive: false });
    button.addEventListener('click', event => {
      event.stopPropagation();
      event.preventDefault();
    });

    container.appendChild(button);
    return { element: button, handler };
  }
}
