export type CameraMode = 'chase' | 'fpv';
export type SnapPreference = 'off' | 'chase' | 'fpv';

export interface ControlSettings {
  deadZone: number;
  maxRadiusPx: number;
  moveSpeed: number;
  yawSpeed: number;
  pitchSpeed: number;
  invertY: boolean;
  smoothing: number;
  snapChaseStrength: number;
  snapFpvStrength: number;
  leftHanded: boolean;
  safeMarginPx: number;
  buttonsMarginPx: number;
}

export interface ControlRuntimeState {
  mode: CameraMode;
  invertY: boolean;
  leftHanded: boolean;
  showJoysticks: boolean;
  snap: SnapPreference;
}

const DEFAULT_SETTINGS: ControlSettings = {
  deadZone: 0.12,
  maxRadiusPx: 68,
  moveSpeed: 5.0,
  yawSpeed: 2.8,
  pitchSpeed: 2.2,
  invertY: false,
  smoothing: 0.18,
  snapChaseStrength: 6.0,
  snapFpvStrength: 3.5,
  leftHanded: false,
  safeMarginPx: 16,
  buttonsMarginPx: 24
};

export const Controls: ControlSettings = { ...DEFAULT_SETTINGS };

const runtime: ControlRuntimeState = {
  mode: 'chase',
  invertY: Controls.invertY,
  leftHanded: Controls.leftHanded,
  showJoysticks: false,
  snap: 'chase'
};

let initialised = false;

export const getControlSettings = (): ControlSettings => Controls;
export const getControlRuntime = (): ControlRuntimeState => runtime;
export const getCameraMode = (): CameraMode => runtime.mode;
export const getSnapPreference = (): SnapPreference => runtime.snap;
export const isLeftHanded = (): boolean => runtime.leftHanded;
export const isInvertedY = (): boolean => runtime.invertY;

export function initControls(search?: string): void {
  if (initialised) {
    return;
  }

  initialised = true;
  const params = createParams(search);

  const parsedMode = parseCameraMode(params.get('mode'));
  if (parsedMode) {
    runtime.mode = parsedMode;
  }

  if (params.get('invertY') === '1') {
    runtime.invertY = true;
  }

  if (params.get('lefty') === '1') {
    runtime.leftHanded = true;
  }

  const parsedSnap = parseSnapPreference(params.get('snap'));
  if (parsedSnap) {
    runtime.snap = parsedSnap;
  }

  const forceJoysticks = params.get('joysticks') === '1';
  runtime.showJoysticks = detectTouch() || forceJoysticks;

  Controls.invertY = runtime.invertY;
  Controls.leftHanded = runtime.leftHanded;
}

export function shouldShowJoysticks(): boolean {
  return runtime.showJoysticks;
}

export function setCameraMode(mode: CameraMode): void {
  runtime.mode = mode;
}

export function setSnapPreference(snap: SnapPreference): void {
  runtime.snap = snap;
}

export function setLeftHanded(leftHanded: boolean): void {
  runtime.leftHanded = leftHanded;
  Controls.leftHanded = leftHanded;
}

export function setInvertY(invertY: boolean): void {
  runtime.invertY = invertY;
  Controls.invertY = invertY;
}

export function isSnapEnabledFor(mode: CameraMode): boolean {
  if (runtime.snap === 'off') {
    return false;
  }
  if (runtime.snap === 'chase') {
    return mode === 'chase';
  }
  if (runtime.snap === 'fpv') {
    return mode === 'fpv';
  }
  return false;
}

export function getSnapGainFor(mode: CameraMode): number {
  return mode === 'chase' ? Controls.snapChaseStrength : Controls.snapFpvStrength;
}

const createParams = (search?: string): URLSearchParams => {
  if (typeof search === 'string') {
    return new URLSearchParams(search);
  }
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search);
  }
  return new URLSearchParams('');
};

const parseCameraMode = (value: string | null): CameraMode | null => {
  if (value === 'chase' || value === 'fpv') {
    return value;
  }
  return null;
};

const parseSnapPreference = (value: string | null): SnapPreference | null => {
  if (value === 'off' || value === 'chase' || value === 'fpv') {
    return value;
  }
  return null;
};

const detectTouch = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return navigator.maxTouchPoints > 0;
};
