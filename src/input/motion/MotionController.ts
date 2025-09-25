import type { InputState, MotionMode } from '../types';
import { createEmptyInputState } from '../types';
import { SensorInput } from './SensorInput';

const CLAMP_DEGREES = 15;

export interface MotionControllerOptions {
  gyroGain?: number;
  tiltSensitivity?: number;
  tiltDeadzone?: number;
}

export class MotionController {
  private mode: MotionMode = 'off';
  private gyroEnabled = false;
  private gyroGain: number;
  private tiltSensitivity: number;
  private tiltDeadzone: number;

  constructor(private readonly sensor: SensorInput) {
    this.gyroGain = 0.02;
    this.tiltSensitivity = 0.6;
    this.tiltDeadzone = 5;
  }

  setMode(mode: MotionMode): void {
    this.mode = mode;
  }

  setGyro(enabled: boolean, gain: number): void {
    this.gyroEnabled = enabled;
    this.gyroGain = gain;
  }

  setTiltOptions(sensitivity: number, deadzone: number): void {
    this.tiltSensitivity = sensitivity;
    this.tiltDeadzone = deadzone;
  }

  async enable(): Promise<boolean> {
    const result = await this.sensor.enable();
    return result === 'granted';
  }

  disable(): void {
    this.sensor.disable();
  }

  calibrate(): void {
    this.sensor.calibrate();
  }

  apply(base: InputState): InputState {
    if (!this.sensor.isEnabled()) {
      return base;
    }

    const result = createEmptyInputState();
    result.move = { ...base.move };
    result.lookDelta = { ...base.lookDelta };
    result.actions = { ...base.actions };

    const tilt = this.computeTilt();

    if (this.gyroEnabled) {
      const delta = this.sensor.getDelta();
      result.lookDelta.x += delta.gammaRate * this.gyroGain;
      result.lookDelta.y += delta.betaRate * this.gyroGain;
    }

    switch (this.mode) {
      case 'tiltMove':
        result.move.x = tilt.roll;
        result.move.y = -tilt.pitch;
        break;
      case 'tiltAssist':
        result.move.x += tilt.roll * 0.5;
        result.move.y += -tilt.pitch * 0.5;
        break;
      case 'gyroAim':
        // Already applied via gyro.
        break;
      default:
        break;
    }

    result.move.x = clamp(result.move.x, -1, 1);
    result.move.y = clamp(result.move.y, -1, 1);
    return result;
  }

  private computeTilt(): { pitch: number; roll: number } {
    const { pitch, roll } = this.sensor.getTilt();
    const normalizedPitch = normalizeTilt(pitch, this.tiltDeadzone, this.tiltSensitivity);
    const normalizedRoll = normalizeTilt(roll, this.tiltDeadzone, this.tiltSensitivity);
    return { pitch: normalizedPitch, roll: normalizedRoll };
  }
}

function normalizeTilt(value: number, deadzone: number, sensitivity: number): number {
  const abs = Math.abs(value);
  if (abs < deadzone) {
    return 0;
  }
  const sign = Math.sign(value);
  const magnitude = Math.min(CLAMP_DEGREES, abs - deadzone);
  return (magnitude / (CLAMP_DEGREES - deadzone)) * sensitivity * sign;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
