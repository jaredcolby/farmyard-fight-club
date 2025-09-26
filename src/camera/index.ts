import * as THREE from 'three';

import { CameraRig, type RigOpts } from './CameraRig';

export function createCameraRig(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  opts: RigOpts = {}
): CameraRig {
  const rig = new CameraRig(camera, opts);
  scene.add(rig);
  return rig;
}

export { CameraRig } from './CameraRig';
export type { RigOpts } from './CameraRig';
