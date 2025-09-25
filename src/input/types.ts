export type Vec2 = { x: number; y: number };

export interface InputActions {
  primary: boolean;
  secondary: boolean;
  jump: boolean;
}

export interface InputState {
  move: Vec2;
  lookDelta: Vec2;
  actions: InputActions;
}

export const emptyVec2 = (): Vec2 => ({ x: 0, y: 0 });

export const createEmptyInputState = (): InputState => ({
  move: emptyVec2(),
  lookDelta: emptyVec2(),
  actions: { primary: false, secondary: false, jump: false }
});

export const mergeInputStates = (target: InputState, source: InputState): InputState => {
  target.move.x += source.move.x;
  target.move.y += source.move.y;
  target.lookDelta.x += source.lookDelta.x;
  target.lookDelta.y += source.lookDelta.y;
  target.actions.primary = target.actions.primary || source.actions.primary;
  target.actions.secondary = target.actions.secondary || source.actions.secondary;
  target.actions.jump = target.actions.jump || source.actions.jump;
  return target;
};

export type MotionMode = 'off' | 'tiltMove' | 'gyroAim' | 'tiltAssist';

export interface MobileControlSettings {
  lookSensitivity: number;
  invertY: boolean;
  gyroAimEnabled: boolean;
  gyroAimSensitivity: number;
  tiltMode: MotionMode;
  tiltSensitivity: number;
  tiltDeadzone: number;
}

export const defaultMobileSettings = (): MobileControlSettings => ({
  lookSensitivity: 0.15,
  invertY: false,
  gyroAimEnabled: false,
  gyroAimSensitivity: 0.02,
  tiltMode: 'off',
  tiltSensitivity: 0.6,
  tiltDeadzone: 5
});
