import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

import type { Game } from './Game';
import type { CharacterOptions, CharacterState, ModelDefinition } from './types';

interface AnimationOptions {
  walkSpeed?: number;
  timeScale?: number;
  force?: boolean;
}

interface AnimationState {
  allActions: Map<string, THREE.AnimationAction>;
  action: THREE.AnimationAction | null;
  mixer: THREE.AnimationMixer;
  name: string;
}

export class Character {
  private static registry = new Map<string, Character>();

  static each(callback: (character: Character, key: string, index: number) => void): void {
    let i = 0;
    Character.registry.forEach((character, key) => {
      callback(character, key, i);
      i += 1;
    });
  }

  public readonly object: THREE.Object3D;
  public readonly box: THREE.BoxHelper;
  public readonly modelName: string;

  protected readonly state: CharacterState = {
    action: '',
    lastAction: '',
    velocity: new THREE.Vector3(),
    speed: 0
  };

  protected readonly animation: AnimationState;
  protected readonly modelClone: THREE.Object3D;
  public readonly kind: CharacterKind;

  constructor(
    protected readonly game: Game,
    public readonly name: string,
    protected readonly model: ModelDefinition,
    options: CharacterOptions = {},
    kind: CharacterKind = "npc"
  ) {
    if (!model.gltf) {
      throw new Error(`Model data missing for ${model.name}`);
    }
    this.modelName = model.name;
    this.kind = kind;

    const position = options.position ?? new THREE.Vector3();
    const rotation = options.rotation ?? new THREE.Vector3();

    this.modelClone = clone(model.gltf.scene);

    this.object = new THREE.Object3D();
    this.object.position.copy(position);
    this.object.rotation.set(rotation.x, rotation.y, rotation.z);
    this.object.add(this.modelClone);
    this.game.sceneRef.add(this.object);

    this.box = new THREE.BoxHelper(this.modelClone, 0xffff00);
    this.box.name = 'boundingBox';
    this.box.geometry.computeBoundingBox();
    this.box.visible = this.game.controls.debug;
    this.object.add(this.box);

    this.animation = {
      allActions: new Map(),
      action: null,
      mixer: new THREE.AnimationMixer(this.modelClone),
      name: ''
    };

    this.animation.mixer.addEventListener('finished', this.handleAnimationFinished);

    this.initialiseAnimations(model);
    this.changeState('idle');

    Character.registry.set(name, this);
  }

  destroy(): void {
    Character.registry.delete(this.name);
    this.animation.mixer.stopAllAction();
    this.animation.mixer.removeEventListener('finished', this.handleAnimationFinished);
    this.object.remove(this.modelClone);
    this.object.remove(this.box);
    this.object.clear();
    this.box.geometry.dispose();
    (this.box.material as THREE.Material).dispose();
    this.game.sceneRef.remove(this.object);
  }

  setDebugVisible(visible: boolean): void {
    this.box.visible = visible;
  }

  getActiveAnimation(): THREE.AnimationAction | null {
    return this.animation.action;
  }

  getCurrentState(): string {
    return this.state.action;
  }

  getSpeed(): number {
    return this.state.speed;
  }

  getVisualForward(target: THREE.Vector3): THREE.Vector3 {
    this.modelClone.getWorldDirection(target);
    target.multiplyScalar(-1);
    target.y = 0;
    if (target.lengthSq() === 0) {
      target.set(0, 0, -1);
    } else {
      target.normalize();
    }
    return target;
  }

  update(deltaTime: number): void {
    const direction = new THREE.Vector3();
    this.object.getWorldDirection(direction);
    this.object.position.addScaledVector(direction, this.state.speed);

    this.animation.mixer.update(deltaTime);
  }

  changeState(state: string, options: AnimationOptions = {}): void {
    if (state === this.state.action && !options.force) {
      return;
    }

    this.state.lastAction = this.state.action;
    this.state.action = state;

    const changed = this.changeAnimation(state, options);
    if (!changed) {
      this.state.action = this.state.lastAction;
      return;
    }

    if (this.game.getPlayer() === this) {
      this.game.controls.playerState = state;
    }

    switch (state) {
      case 'walk':
        this.state.speed = this.game.walkSpeed * (options.walkSpeed ?? 1);
        break;

      case 'idle':
      case 'death':
        this.state.speed = 0;
        break;

      default:
        break;
    }
  }

  protected changeAnimation(name: string, options: AnimationOptions): boolean {
    const next = this.animation.allActions.get(name);
    if (!next) {
      console.warn(`Animation ${name} not available for ${this.name}`);
      return false;
    }

    if (this.animation.action) {
      this.animation.action.crossFadeTo(next, 1, true);
    }

    this.animation.action = next;
    this.animation.name = name;
    this.animation.action.enabled = true;
    this.animation.action.timeScale = options.timeScale ?? 1;
    this.animation.action.reset().play();

    if (name === 'death') {
      this.animation.action.setLoop(THREE.LoopOnce, 1);
      this.animation.action.clampWhenFinished = true;
    }

    return true;
  }

  protected initialiseAnimations(model: ModelDefinition): void {
    if (!model.animations) {
      throw new Error(`Animations missing for ${model.name}`);
    }

    Object.entries(model.animations).forEach(([name, clip]) => {
      const action = this.animation.mixer.clipAction(clip);
      action.name = name;
      this.animation.allActions.set(name, action);
    });
  }

  protected handleAnimationFinished = (event: THREE.Event & { action: THREE.AnimationAction }): void => {
    if (event.action.name === 'death') {
      this.object.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const updated = materials.map(material => {
            if ('wireframe' in material) {
              const clone = material.clone();
              (clone as { wireframe: boolean }).wireframe = true;
              return clone;
            }
            return material;
          });
          mesh.material = Array.isArray(mesh.material) ? updated : updated[0];
        }
      });
      this.changeState('walk');
    }
  };

  protected collisionDetect(other: Character): boolean {
    const playerBox = this.box.geometry.boundingBox?.clone();
    const otherBox = other.box.geometry.boundingBox?.clone();

    if (!playerBox || !otherBox) {
      return false;
    }

    playerBox.applyMatrix4(this.object.matrixWorld);
    otherBox.applyMatrix4(other.object.matrixWorld);

    return playerBox.intersectsBox(otherBox);
  }
}

export class Player extends Character {
  private static instance: Player | null = null;
  private static updateCount = 0;

  constructor(game: Game, name: string, model: ModelDefinition, options: CharacterOptions = {}) {
    super(game, name, model, options, 'player');

    if (!Player.instance) {
      Player.instance = this;
    }
  }

  static get one(): Player | null {
    return Player.instance;
  }

  update(deltaTime: number): void {
    super.update(deltaTime);

    if (Player.updateCount > 0) {
      Character.each(character => {
        if (character === this || character.kind !== 'npc' || character.state.action === 'death') {
          return;
        }

        if (this.collisionDetect(character)) {
          character.box.material.color.set(0xff0000);
          character.changeState('death');
          this.game.audioManager.play(character.modelName);
        }
      });
    }

    Player.updateCount += 1;
  }
}

export class RemotePlayer extends Character {
  private lastTimestamp = 0;

  constructor(game: Game, name: string, model: ModelDefinition, options: CharacterOptions = {}) {
    super(game, name, model, options, 'remote');
  }

  applySnapshot(snapshot: PlayerSnapshot): void {
    this.lastTimestamp = snapshot.timestamp;
    const [x, y, z] = snapshot.position;
    this.object.position.set(x, y, z);
    const [rotX, rotY, rotZ] = snapshot.rotation;
    this.object.rotation.set(rotX, rotY, rotZ);

    const currentState = this.getCurrentState();
    this.changeState(snapshot.state, {
      walkSpeed: snapshot.walkSpeed,
      timeScale: snapshot.timeScale,
      force: snapshot.state === currentState
    });
  }

  update(deltaTime: number): void {
    this.animation.mixer.update(deltaTime);
  }
}
