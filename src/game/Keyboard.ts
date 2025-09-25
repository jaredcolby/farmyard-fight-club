import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';

import type { Game } from './Game';
import type { Player } from './Character';

const TURN_INCREMENT = 0.03;

export class KeyboardManager {
  private readonly trackedKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'c', ' ']);
  private readonly state = new Map<string, boolean>();

  private handleKeyDownBound = (event: KeyboardEvent) => this.handleKeyDown(event);
  private handleKeyUpBound = (event: KeyboardEvent) => this.handleKeyUp(event);

  constructor(private readonly game: Game, private readonly playerRef: () => Player) {}

  register(): void {
    document.addEventListener('keydown', this.handleKeyDownBound);
    document.addEventListener('keyup', this.handleKeyUpBound);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.handleKeyDownBound);
    document.removeEventListener('keyup', this.handleKeyUpBound);
  }

  handleHeldKeys(): void {
    const player = this.playerRef();

    if (this.state.get('ArrowLeft')) {
      player.object.rotateY(TURN_INCREMENT);
    } else if (this.state.get('ArrowRight')) {
      player.object.rotateY(-TURN_INCREMENT);
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.trackedKeys.has(event.key)) {
      return;
    }

    event.stopPropagation();

    if (this.state.get(event.key)) {
      return;
    }

    this.state.set(event.key, true);
    this.handleKey(event, true);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.trackedKeys.has(event.key)) {
      return;
    }

    event.stopPropagation();

    this.state.set(event.key, false);
    this.handleKey(event, false);
  }

  private handleKey(event: KeyboardEvent, pressed: boolean): void {
    const player = this.playerRef();
    const audio = this.game.audioManager;

    switch (event.key) {
      case 'ArrowUp':
        if (pressed) {
          audio.setPlaybackRate('walk', audioRateForWalk(player));
          audio.play('walk');
          player.changeState('walk');
        } else {
          audio.stop('walk');
          player.changeState('idle');
        }
        break;

      case 'ArrowDown':
        if (pressed) {
          audio.setPlaybackRate('walk', 0.5);
          audio.play('walk');
          player.changeState('walk', { walkSpeed: -0.3, timeScale: -1 });
        } else {
          audio.stop('walk');
          player.changeState('idle');
        }
        break;

      case ' ': {
        if (pressed) {
          audio.setPlaybackRate('walk', 0.5);
          audio.play('walk');
          player.changeState('jump');
        } else {
          audio.stop('walk');
          player.changeState('idle');
        }
        break;
      }

      case 'c':
        if (pressed) {
          this.toggleCamera(player.object, this.game.getCameraControls(), this.game.getCamera());
        }
        break;

      default:
        break;
    }
  }

  private toggleCamera(playerObject: THREE.Object3D, controls: OrbitControls, camera: THREE.PerspectiveCamera): void {
    if (this.game.controls.cameraPOV === 'world') {
      this.game.controls.cameraPOV = 'player';
      controls.saveState();
      playerObject.add(camera);
      camera.position.set(0, 10, -20);
      const lookAtTarget = playerObject.position.clone().add(new THREE.Vector3(0, 10, 0));
      camera.lookAt(lookAtTarget);
    } else {
      this.game.controls.cameraPOV = 'world';
      playerObject.remove(camera);
      controls.reset();
    }
  }
}

function audioRateForWalk(player: Player): number {
  const active = player.getActiveAnimation();
  if (!active) {
    return 1;
  }

  return Math.abs(active.timeScale ?? 1);
}
