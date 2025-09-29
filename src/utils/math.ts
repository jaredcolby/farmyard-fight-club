const TAU = Math.PI * 2;

export function normaliseAngle(angle: number): number {
  if (!Number.isFinite(angle)) {
    return 0;
  }
  let wrapped = angle % TAU;
  if (wrapped <= -Math.PI) {
    wrapped += TAU;
  } else if (wrapped > Math.PI) {
    wrapped -= TAU;
  }
  return wrapped;
}

export function shortestAngleDiff(from: number, to: number): number {
  return normaliseAngle(to - from);
}

export function expBlend(current: number, target: number, gain: number, deltaTime: number): number {
  if (!Number.isFinite(gain) || gain <= 0 || !Number.isFinite(deltaTime) || deltaTime <= 0) {
    return target;
  }
  const alpha = 1 - Math.exp(-gain * deltaTime);
  return current + (target - current) * alpha;
}
