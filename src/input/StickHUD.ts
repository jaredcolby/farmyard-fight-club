import type { CameraMode, SnapPreference } from '../settings/controls';
import type { StickValue } from './VirtualJoystick';

export interface StickHudSample {
  left: StickValue;
  right: StickValue;
  cameraYaw: number;
  cameraPitch: number;
  characterYaw: number;
  mode: CameraMode;
  snapPreference: SnapPreference;
  snapping: boolean;
  snapCorrection: number;
  deltaTime: number;
}

const MAG_BUCKETS = [0.0, 0.25, 0.5, 0.75, 1.01];

export class StickHUD {
  private readonly root: HTMLDivElement;
  private readonly leftLine: HTMLDivElement;
  private readonly rightLine: HTMLDivElement;
  private readonly cameraLine: HTMLDivElement;
  private readonly modeLine: HTMLDivElement;

  private readonly leftBuckets = new Uint32Array(MAG_BUCKETS.length - 1);
  private readonly rightBuckets = new Uint32Array(MAG_BUCKETS.length - 1);
  private snapCorrectionSum = 0;
  private snapSamples = 0;
  private elapsed = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'stick-hud';

    const row = document.createElement('div');
    row.className = 'stick-hud__row';

    this.leftLine = document.createElement('div');
    this.leftLine.className = 'stick-hud__column';
    this.rightLine = document.createElement('div');
    this.rightLine.className = 'stick-hud__column';

    this.cameraLine = document.createElement('div');
    this.cameraLine.className = 'stick-hud__column';

    this.modeLine = document.createElement('div');
    this.modeLine.className = 'stick-hud__column';

    row.appendChild(this.leftLine);
    row.appendChild(this.rightLine);
    row.appendChild(this.cameraLine);
    row.appendChild(this.modeLine);
    this.root.appendChild(row);
    parent.appendChild(this.root);
  }

  dispose(): void {
    this.root.remove();
  }

  update(sample: StickHudSample): void {
    this.writeStickColumn(this.leftLine, 'L', sample.left);
    this.writeStickColumn(this.rightLine, 'R', sample.right);
    this.cameraLine.innerText = `cam yaw ${fmt(sample.cameraYaw)}\npitch ${fmt(sample.cameraPitch)}\nchar ${fmt(sample.characterYaw)}`;
    const snapState = sample.snapping ? 'on' : 'off';
    this.modeLine.innerText = `mode ${sample.mode}\nsnap ${sample.snapPreference}\nstate ${snapState}`;

    this.recordStats(sample);
  }

  private writeStickColumn(column: HTMLDivElement, label: string, value: StickValue): void {
    column.innerText = `${label} x ${fmt(value.x)}\ny ${fmt(value.y)}\nmag ${fmt(value.magnitude)}`;
  }

  private recordStats(sample: StickHudSample): void {
    this.addToBucket(this.leftBuckets, sample.left.magnitude);
    this.addToBucket(this.rightBuckets, sample.right.magnitude);
    this.snapCorrectionSum += Math.abs(sample.snapCorrection);
    this.snapSamples += 1;
    this.elapsed += sample.deltaTime;

    if (this.elapsed >= 2) {
      const leftHistogram = formatHistogram('L', this.leftBuckets);
      const rightHistogram = formatHistogram('R', this.rightBuckets);
      const snapAvg = this.snapSamples > 0 ? this.snapCorrectionSum / this.snapSamples : 0;
      console.info('[StickHUD]', leftHistogram, rightHistogram, `snapAvg=${fmt(snapAvg)}`);
      this.leftBuckets.fill(0);
      this.rightBuckets.fill(0);
      this.snapCorrectionSum = 0;
      this.snapSamples = 0;
      this.elapsed = 0;
    }
  }

  private addToBucket(target: Uint32Array, magnitude: number): void {
    const clamped = Math.max(0, Math.min(1, magnitude));
    for (let i = 0; i < MAG_BUCKETS.length - 1; i += 1) {
      const min = MAG_BUCKETS[i];
      const max = MAG_BUCKETS[i + 1];
      if (clamped >= min && clamped < max) {
        target[i] += 1;
        return;
      }
    }
    target[target.length - 1] += 1;
  }
}

const fmt = (value: number): string => value.toFixed(2);

const formatHistogram = (label: string, buckets: Uint32Array): string => {
  const parts: string[] = [];
  for (let i = 0; i < buckets.length; i += 1) {
    const min = MAG_BUCKETS[i];
    const next = MAG_BUCKETS[i + 1] ?? 1;
    const max = Math.min(next, 1);
    parts.push(`${min.toFixed(2)}-${max.toFixed(2)}:${buckets[i]}`);
  }
  return `${label}[${parts.join(', ')}]`;
};
