import * as THREE from 'three';

import '../../input/dualSticks.css';

import { ActionButtons } from '../../input/mobile/ActionButtons';
import { StickHUD, StickHudSample } from '../../input/StickHUD';
import { VirtualJoystick, StickValue } from '../../input/VirtualJoystick';
import {
  CameraMode,
  Controls,
  getCameraMode,
  getControlRuntime,
  initControls,
  isInvertedY,
  isLeftHanded,
  setLeftHanded,
  shouldShowJoysticks
} from '../../settings/controls';
import type { InputActions } from '../../input/types';
import { CameraRig } from '../camera/CameraRig';
import { cameraUtils } from '../camera/CameraRig';
import { Player } from '../Character';

interface KeepOutRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface MobileDualSticksOptions {
  root?: HTMLElement;
  debug?: boolean;
  onToggleCamera?: () => void;
  onToggleMenu?: () => void;
}

const DEAD_ZONE = Controls.deadZone;

export class MobileDualSticks {
  private readonly root: HTMLDivElement;
  private readonly buttons: ActionButtons;
  private readonly leftStick: VirtualJoystick;
  private readonly rightStick: VirtualJoystick;
  private readonly leftValue: StickValue = { x: 0, y: 0, magnitude: 0 };
  private readonly rightValue: StickValue = { x: 0, y: 0, magnitude: 0 };
  private readonly actions: InputActions = { primary: false, secondary: false, jump: false };
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly moveVector = new THREE.Vector3();
  private readonly tempHudSample: StickHudSample = {
    left: this.leftValue,
    right: this.rightValue,
    cameraYaw: 0,
    cameraPitch: 0,
    characterYaw: 0,
    mode: getCameraMode(),
    snapPreference: getControlRuntime().snap,
    snapping: false,
    snapCorrection: 0,
    deltaTime: 0
  };
  private readonly keepOut: KeepOutRect = { left: 0, right: 0, top: 0, bottom: 0 };

  private readonly hud?: StickHUD;
  private readonly handednessButton: HTMLButtonElement;
  private utilities: HTMLDivElement | null = null;

  private readonly allowMouseInput: boolean;
  private snapCorrection = 0;
  private snapping = false;

  constructor(private readonly options: MobileDualSticksOptions = {}) {
    initControls();

    this.allowMouseInput = !('ontouchstart' in window) || shouldShowJoysticks();
    this.root = document.createElement('div');
    this.root.className = 'dual-sticks hidden';
    this.root.style.setProperty('--stick-radius', `${Controls.maxRadiusPx}px`);
    this.root.style.setProperty('--stick-safe-margin', `${Controls.safeMarginPx}px`);
    this.root.style.setProperty('--stick-buttons-margin', `${Controls.buttonsMarginPx}px`);

    const mountPoint = options.root ?? document.body;
    mountPoint.appendChild(this.root);

    this.buttons = new ActionButtons(this.root);

    this.leftStick = new VirtualJoystick(this.root, {
      className: 'dual-stick--left',
      allowMouse: this.allowMouseInput,
      name: 'left'
    });

    this.rightStick = new VirtualJoystick(this.root, {
      className: 'dual-stick--right',
      allowMouse: this.allowMouseInput,
      name: 'right',
      blockStart: event => !this.isInKeepOut(event)
    });

    this.handednessButton = this.createHandednessToggle();
    this.utilities = this.createUtilities();

    if (options.debug) {
      this.hud = new StickHUD(document.body);
    }

    window.addEventListener('resize', this.handleResize, { passive: true });
    this.applyHandedness(isLeftHanded());
    this.updateKeepOut();

    if (shouldShowJoysticks()) {
      this.root.classList.remove('hidden');
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.buttons.dispose();
    this.leftStick.dispose();
    this.rightStick.dispose();
    this.utilities?.remove();
    this.hud?.dispose();
    this.root.remove();
  }

  canUse(): boolean {
    return shouldShowJoysticks();
  }

  setInteractive(interactive: boolean): void {
    if (interactive) {
      this.root.classList.remove('disabled');
    } else {
      this.root.classList.add('disabled');
    }
  }

  setHandedness(leftHanded: boolean): void {
    setLeftHanded(leftHanded);
    this.applyHandedness(leftHanded);
  }

  getActions(): InputActions {
    const buttonState = this.buttons.getState();
    this.actions.primary = buttonState.primary;
    this.actions.secondary = buttonState.secondary;
    this.actions.jump = buttonState.jump;
    return this.actions;
  }

  update(deltaTime: number): void {
    this.leftStick.update();
    this.rightStick.update();
    this.leftStick.read(this.leftValue);
    this.rightStick.read(this.rightValue);
    this.updateKeepOut();
  }

  applyMovement(player: Player, cameraRig: CameraRig, deltaTime: number): number {
    if (this.leftValue.magnitude < DEAD_ZONE) {
      return 0;
    }

    const cameraForward = cameraRig.getForward(this.forward);
    cameraForward.y = 0;
    if (cameraForward.lengthSq() < 1e-5) {
      cameraForward.set(0, 0, -1);
    }
    cameraForward.normalize();

    const cameraRight = this.right.copy(cameraForward).cross(this.up).normalize();

    this.moveVector
      .copy(cameraRight)
      .multiplyScalar(-this.leftValue.x)
      .addScaledVector(cameraForward, -this.leftValue.y);

    const magnitude = this.moveVector.length();
    if (magnitude < 1e-5) {
      return 0;
    }

    this.moveVector.multiplyScalar(1 / magnitude);

    const displacement = Controls.moveSpeed * this.leftValue.magnitude * deltaTime;
    player.object.position.addScaledVector(this.moveVector, displacement);

    const targetYaw = Math.atan2(this.moveVector.x, -this.moveVector.z);
    const currentYaw = cameraUtils.normaliseAngle(player.object.rotation.y);
    const yawDelta = cameraUtils.shortestAngleDiff(currentYaw, targetYaw);
    const rotationStep = yawDelta * (1 - Math.exp(-10 * deltaTime));
    player.object.rotation.y = cameraUtils.normaliseAngle(currentYaw + rotationStep);

    return this.leftValue.magnitude;
  }

  applyCamera(player: Player, cameraRig: CameraRig, deltaTime: number): boolean {
    const mode = getCameraMode();
    cameraRig.setMode(mode);

    const yawDelta = this.rightValue.x * Controls.yawSpeed * deltaTime;
    const invertMultiplier = isInvertedY() ? -1 : 1;
    const pitchDelta = this.rightValue.y * Controls.pitchSpeed * deltaTime * invertMultiplier;

    let usedInput = false;
    if (this.rightValue.magnitude >= DEAD_ZONE) {
      if (Math.abs(yawDelta) > 0) {
        cameraRig.addYaw(yawDelta);
        usedInput = true;
      }
      if (Math.abs(pitchDelta) > 0) {
        cameraRig.addPitch(pitchDelta);
        usedInput = true;
      }
      this.snapping = false;
      this.snapCorrection = 0;
    }
    this.tempHudSample.mode = mode;
    return usedInput;
  }

  private getChasePitchTarget(): number {
    return THREE.MathUtils.degToRad(-12);
  }

  private pushHud(player: Player, cameraRig: CameraRig, mode: CameraMode, deltaTime: number): void {
    if (!this.hud) {
      return;
    }

    this.tempHudSample.left = this.leftValue;
    this.tempHudSample.right = this.rightValue;
    this.tempHudSample.cameraYaw = cameraRig.getYaw();
    this.tempHudSample.cameraPitch = cameraRig.getPitch();
    this.tempHudSample.characterYaw = cameraUtils.normaliseAngle(player.object.rotation.y);
    this.tempHudSample.mode = mode;
    this.tempHudSample.snapPreference = getControlRuntime().snap;
    this.tempHudSample.snapping = this.snapping;
    this.tempHudSample.snapCorrection = this.snapCorrection;
    this.tempHudSample.deltaTime = deltaTime;

    this.hud.update(this.tempHudSample);
  }

  afterCameraUpdate(player: Player, cameraRig: CameraRig, deltaTime: number): void {
    this.pushHud(player, cameraRig, this.tempHudSample.mode, deltaTime);
  }

  private updateKeepOut(): void {
    const bounds = this.buttons.getBounds();
    if (!bounds) {
      this.keepOut.left = 0;
      this.keepOut.right = 0;
      this.keepOut.top = 0;
      this.keepOut.bottom = 0;
      return;
    }

    this.keepOut.left = bounds.left - Controls.buttonsMarginPx;
    this.keepOut.right = bounds.right + Controls.buttonsMarginPx;
    this.keepOut.top = bounds.top - Controls.buttonsMarginPx;
    this.keepOut.bottom = bounds.bottom + Controls.buttonsMarginPx;
  }

  private isInKeepOut(event: PointerEvent): boolean {
    const { left, right, top, bottom } = this.keepOut;
    const x = event.clientX;
    const y = event.clientY;
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  private applyHandedness(leftHanded: boolean): void {
    if (leftHanded) {
      this.root.classList.add('dual-sticks--lefty');
    } else {
      this.root.classList.remove('dual-sticks--lefty');
    }
    this.handednessButton.setAttribute('aria-pressed', leftHanded ? 'true' : 'false');
    this.handednessButton.textContent = leftHanded ? 'Right-side' : 'Left-side';
    this.leftStick.refreshLayout();
    this.rightStick.refreshLayout();
    this.updateKeepOut();
    if (this.utilities) {
      if (leftHanded) {
        this.utilities.classList.add('dual-sticks__utilities--left');
      } else {
        this.utilities.classList.remove('dual-sticks__utilities--left');
      }
    }
  }

  private createHandednessToggle(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dual-sticks__swap';
    button.setAttribute('aria-label', 'Swap joystick sides');
    button.textContent = isLeftHanded() ? 'Right-side' : 'Left-side';
    button.setAttribute('aria-pressed', isLeftHanded() ? 'true' : 'false');
    const toggle = (): void => {
      const next = !isLeftHanded();
      this.setHandedness(next);
    };

    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    this.root.appendChild(button);
    return button;
  }

  private createUtilities(): HTMLDivElement | null {
    const actions: Array<{ label: string; handler?: () => void; className: string }> = [
      { label: 'Cam', handler: this.options.onToggleCamera, className: 'dual-sticks__cam' },
      { label: 'Menu', handler: this.options.onToggleMenu, className: 'dual-sticks__menu' }
    ];

    const available = actions.filter(entry => typeof entry.handler === 'function');
    if (available.length === 0) {
      return null;
    }

    const container = document.createElement('div');
    container.className = 'dual-sticks__utilities';

    available.forEach(entry => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `dual-sticks__utility ${entry.className}`;
      button.textContent = entry.label;
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        event.stopPropagation();
        entry.handler?.();
      });
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
      });
      container.appendChild(button);
    });

    this.root.appendChild(container);
    if (isLeftHanded()) {
      container.classList.add('dual-sticks__utilities--left');
    }
    return container;
  }

  private handleResize = (): void => {
    this.leftStick.refreshLayout();
    this.rightStick.refreshLayout();
    this.updateKeepOut();
  };
}
