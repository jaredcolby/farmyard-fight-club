export type CameraMode = "chase" | "fpv";
export type SnapPreference = "off" | "chase" | "fpv";

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

export interface CameraAngleRange {
  min: number;
  max: number;
}

export interface CameraTuning {
  tps: {
    fov: number;
    armLength: number;
    shoulderOffset: { x: number; y: number; z: number };
    pivotOffsetY: number;
    positionLagGain: number;
    rotationLagGain: number;
    collisionRadius: number;
    minArmLength: number;
    idleGraceSeconds: number;
    yawAlignGain: number;
    pitchRange: CameraAngleRange;
  };
  fpv: {
    fov: number;
    eyeHeightFactor: number;
    forwardOffset: number;
    positionLagGain: number;
    rotationLagGain: number;
    pitchRange: CameraAngleRange;
  };
}

const DEFAULT_SETTINGS: ControlSettings = {
  deadZone: 0.12,
  maxRadiusPx: 68,
  moveSpeed: 5.0,
  yawSpeed: 3.4,
  pitchSpeed: 2.5,
  invertY: false,
  smoothing: 0.18,
  snapChaseStrength: 6.0,
  snapFpvStrength: 3.5,
  leftHanded: false,
  safeMarginPx: 16,
  buttonsMarginPx: 24,
};

export const Controls: ControlSettings = { ...DEFAULT_SETTINGS };

const DEFAULT_CAMERA_TUNING: CameraTuning = {
  tps: {
    fov: 75,
    armLength: 15,
    shoulderOffset: { x: 0, y: 3, z: 0 },
    pivotOffsetY: 3,
    positionLagGain: 8.5,
    rotationLagGain: 12.5,
    collisionRadius: 0.28,
    minArmLength: 0.6,
    idleGraceSeconds: 0.6,
    yawAlignGain: 8.2,
    pitchRange: {
      min: degToRad(-45),
      max: degToRad(45),
    },
  },
  fpv: {
    fov: 94,
    eyeHeightFactor: 0.92,
    forwardOffset: 0.12,
    positionLagGain: 14,
    rotationLagGain: 16,
    pitchRange: {
      min: degToRad(-80),
      max: degToRad(80),
    },
  },
};

const cameraTuning: CameraTuning = {
  tps: {
    ...DEFAULT_CAMERA_TUNING.tps,
    shoulderOffset: { ...DEFAULT_CAMERA_TUNING.tps.shoulderOffset },
    pitchRange: { ...DEFAULT_CAMERA_TUNING.tps.pitchRange },
  },
  fpv: {
    ...DEFAULT_CAMERA_TUNING.fpv,
    pitchRange: { ...DEFAULT_CAMERA_TUNING.fpv.pitchRange },
  },
};

const runtime: ControlRuntimeState = {
  mode: "chase",
  invertY: Controls.invertY,
  leftHanded: Controls.leftHanded,
  showJoysticks: false,
  snap: "chase",
};

let initialised = false;

export const getControlSettings = (): ControlSettings => Controls;
export const getControlRuntime = (): ControlRuntimeState => runtime;
export const getCameraMode = (): CameraMode => runtime.mode;
export const getSnapPreference = (): SnapPreference => runtime.snap;
export const isLeftHanded = (): boolean => runtime.leftHanded;
export const isInvertedY = (): boolean => runtime.invertY;
export const getCameraTuning = (): CameraTuning => ({
  tps: {
    ...cameraTuning.tps,
    shoulderOffset: { ...cameraTuning.tps.shoulderOffset },
    pitchRange: { ...cameraTuning.tps.pitchRange },
  },
  fpv: {
    ...cameraTuning.fpv,
    pitchRange: { ...cameraTuning.fpv.pitchRange },
  },
});

export function initControls(search?: string): void {
  if (initialised) {
    return;
  }

  initialised = true;
  const params = createParams(search);

  const parsedMode =
    parseCameraMode(params.get("mode")) ??
    parseCameraMode(params.get("cameraMode"));
  if (parsedMode) {
    runtime.mode = parsedMode;
  }

  if (params.get("invertY") === "1") {
    runtime.invertY = true;
  }

  if (params.get("lefty") === "1") {
    runtime.leftHanded = true;
  }

  const parsedSnap = parseSnapPreference(params.get("snap"));
  if (parsedSnap) {
    runtime.snap = parsedSnap;
  }

  const forceJoysticks = params.get("joysticks") === "1";
  runtime.showJoysticks = detectTouch() || forceJoysticks;

  Controls.invertY = runtime.invertY;
  Controls.leftHanded = runtime.leftHanded;

  applyCameraParams(params);
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
  if (runtime.snap === "off") {
    return false;
  }
  if (runtime.snap === "chase") {
    return mode === "chase";
  }
  if (runtime.snap === "fpv") {
    return mode === "fpv";
  }
  return false;
}

export function getSnapGainFor(mode: CameraMode): number {
  return mode === "chase"
    ? Controls.snapChaseStrength
    : Controls.snapFpvStrength;
}

const createParams = (search?: string): URLSearchParams => {
  if (typeof search === "string") {
    return new URLSearchParams(search);
  }
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search);
  }
  return new URLSearchParams("");
};

const parseCameraMode = (value: string | null): CameraMode | null => {
  if (value === "chase" || value === "fpv") {
    return value;
  }
  return null;
};

const parseSnapPreference = (value: string | null): SnapPreference | null => {
  if (value === "off" || value === "chase" || value === "fpv") {
    return value;
  }
  return null;
};

const detectTouch = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }
  return navigator.maxTouchPoints > 0;
};

function applyCameraParams(params: URLSearchParams): void {
  assignNumber(params, "fovTPS", (value) => {
    cameraTuning.tps.fov = clampNumber(value, 60, 110, cameraTuning.tps.fov);
  });
  assignNumber(params, "fovFPV", (value) => {
    cameraTuning.fpv.fov = clampNumber(value, 80, 120, cameraTuning.fpv.fov);
  });
  assignNumber(params, "armLen", (value) => {
    cameraTuning.tps.armLength = clampNumber(
      value,
      2.5,
      8,
      cameraTuning.tps.armLength
    );
  });
  assignNumber(params, "shoulderX", (value) => {
    cameraTuning.tps.shoulderOffset.x = clampNumber(
      value,
      -2,
      2,
      cameraTuning.tps.shoulderOffset.x
    );
  });
  assignNumber(params, "shoulderY", (value) => {
    cameraTuning.tps.shoulderOffset.y = clampNumber(
      value,
      -2,
      3,
      cameraTuning.tps.shoulderOffset.y
    );
  });
  assignNumber(params, "shoulderZ", (value) => {
    cameraTuning.tps.shoulderOffset.z = clampNumber(
      value,
      -2,
      2,
      cameraTuning.tps.shoulderOffset.z
    );
  });
  assignNumber(params, "pivotY", (value) => {
    cameraTuning.tps.pivotOffsetY = clampNumber(
      value,
      -2,
      3,
      cameraTuning.tps.pivotOffsetY
    );
  });
  assignNumber(params, "tpsPosLag", (value) => {
    cameraTuning.tps.positionLagGain = clampNumber(
      value,
      1,
      30,
      cameraTuning.tps.positionLagGain
    );
  });
  assignNumber(params, "tpsRotLag", (value) => {
    cameraTuning.tps.rotationLagGain = clampNumber(
      value,
      1,
      40,
      cameraTuning.tps.rotationLagGain
    );
  });
  assignNumber(params, "yawGain", (value) => {
    cameraTuning.tps.rotationLagGain = clampNumber(
      value,
      1,
      40,
      cameraTuning.tps.rotationLagGain
    );
  });
  assignNumber(params, "posGain", (value) => {
    cameraTuning.tps.positionLagGain = clampNumber(
      value,
      1,
      30,
      cameraTuning.tps.positionLagGain
    );
  });
  assignNumber(params, "collisionRadius", (value) => {
    cameraTuning.tps.collisionRadius = clampNumber(
      value,
      0.05,
      1,
      cameraTuning.tps.collisionRadius
    );
  });
  assignNumber(params, "collisionMin", (value) => {
    cameraTuning.tps.minArmLength = clampNumber(
      value,
      0.2,
      2,
      cameraTuning.tps.minArmLength
    );
  });
  assignNumber(params, "minArm", (value) => {
    cameraTuning.tps.minArmLength = clampNumber(
      value,
      0.2,
      2,
      cameraTuning.tps.minArmLength
    );
  });
  assignNumber(params, "idleGrace", (value) => {
    cameraTuning.tps.idleGraceSeconds = clampNumber(
      value,
      0,
      5,
      cameraTuning.tps.idleGraceSeconds
    );
  });
  assignNumber(params, "yawAlignGain", (value) => {
    cameraTuning.tps.yawAlignGain = clampNumber(
      value,
      0,
      40,
      cameraTuning.tps.yawAlignGain
    );
  });
  assignNumber(params, "pitchMin", (value) => {
    cameraTuning.tps.pitchRange.min = clampNumber(
      degToRad(value),
      degToRad(-89),
      degToRad(0),
      cameraTuning.tps.pitchRange.min
    );
  });
  assignNumber(params, "pitchMax", (value) => {
    cameraTuning.tps.pitchRange.max = clampNumber(
      degToRad(value),
      degToRad(-5),
      degToRad(89),
      cameraTuning.tps.pitchRange.max
    );
  });
  assignNumber(params, "fpvPitchMin", (value) => {
    cameraTuning.fpv.pitchRange.min = clampNumber(
      degToRad(value),
      degToRad(-89),
      degToRad(0),
      cameraTuning.fpv.pitchRange.min
    );
  });
  assignNumber(params, "fpvPitchMax", (value) => {
    cameraTuning.fpv.pitchRange.max = clampNumber(
      degToRad(value),
      degToRad(0),
      degToRad(89),
      cameraTuning.fpv.pitchRange.max
    );
  });
  assignNumber(params, "eyeHeight", (value) => {
    cameraTuning.fpv.eyeHeightFactor = clampNumber(
      value,
      0.5,
      1.5,
      cameraTuning.fpv.eyeHeightFactor
    );
  });
  assignNumber(params, "fpvForward", (value) => {
    cameraTuning.fpv.forwardOffset = clampNumber(
      value,
      -1,
      1,
      cameraTuning.fpv.forwardOffset
    );
  });
  assignNumber(params, "fpvPosLag", (value) => {
    cameraTuning.fpv.positionLagGain = clampNumber(
      value,
      1,
      40,
      cameraTuning.fpv.positionLagGain
    );
  });
  assignNumber(params, "fpvRotLag", (value) => {
    cameraTuning.fpv.rotationLagGain = clampNumber(
      value,
      1,
      60,
      cameraTuning.fpv.rotationLagGain
    );
  });
}

function assignNumber(
  params: URLSearchParams,
  key: string,
  apply: (value: number) => void
): void {
  const value = params.get(key);
  if (value === null) {
    return;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return;
  }
  apply(parsed);
}

function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function degToRad(value: number): number {
  return (Math.PI / 180) * value;
}
