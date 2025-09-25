interface OrientationSample {
  alpha: number;
  beta: number;
  gamma: number;
  timestamp: number;
}

interface OrientationDelta {
  betaRate: number;
  gammaRate: number;
}

const SMOOTH_ALPHA = 0.2;

type PermissionResult = 'granted' | 'denied' | 'unavailable';

export class SensorInput {
  private enabled = false;
  private current: OrientationSample = { alpha: 0, beta: 0, gamma: 0, timestamp: performance.now() };
  private previous: OrientationSample | null = null;
  private delta: OrientationDelta = { betaRate: 0, gammaRate: 0 };
  private calibration = { beta: 0, gamma: 0 };

  private handleDeviceOrientation = (event: DeviceOrientationEvent): void => {
    if (event.beta == null || event.gamma == null) {
      return;
    }

    const timestamp = performance.now();
    const alpha = event.alpha ?? 0;
    const beta = event.beta;
    const gamma = event.gamma;

    this.previous = this.current;
    this.current = { alpha, beta, gamma, timestamp };

    if (this.previous) {
      const dt = (timestamp - this.previous.timestamp) / 1000;
      if (dt > 0) {
        const betaRate = (beta - this.previous.beta) / dt;
        const gammaRate = (gamma - this.previous.gamma) / dt;
        this.delta.betaRate += (betaRate - this.delta.betaRate) * SMOOTH_ALPHA;
        this.delta.gammaRate += (gammaRate - this.delta.gammaRate) * SMOOTH_ALPHA;
      }
    }
  };

  async enable(): Promise<PermissionResult> {
    if (this.enabled) {
      return 'granted';
    }

    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return 'unavailable';
    }

    if (typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response !== 'granted') {
          return 'denied';
        }
      } catch (error) {
        console.warn('Motion permission error', error);
        return 'denied';
      }
    }

    window.addEventListener('deviceorientation', this.handleDeviceOrientation, true);
    this.enabled = true;
    return 'granted';
  }

  disable(): void {
    if (!this.enabled) {
      return;
    }
    window.removeEventListener('deviceorientation', this.handleDeviceOrientation, true);
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  calibrate(): void {
    this.calibration = { beta: this.current.beta, gamma: this.current.gamma };
  }

  getTilt(): { pitch: number; roll: number } {
    const pitch = this.current.beta - this.calibration.beta;
    const roll = this.current.gamma - this.calibration.gamma;
    return { pitch, roll };
  }

  getDelta(): OrientationDelta {
    return { ...this.delta };
  }
}
