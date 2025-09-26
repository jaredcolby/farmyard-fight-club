import * as THREE from 'three';
import { GUI } from 'dat.gui';
import Stats from 'stats.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { ControlMode, ModelDefinition, PlayerSnapshot } from './types';
import { Character, Player, RemotePlayer } from './Character';
import { InputManager } from '../input/InputManager';
import type { InputState } from '../input/types';
import { SceneryManager } from './Scenery';
import { AudioManager } from './audio';
import { MultiplayerClient } from './MultiplayerClient';
import { CameraRig, createCameraRig } from '../camera';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const CAMERA_DISTANCE_STORAGE_KEY = 'FYC_CAM_DIST';

export interface GameControls {
  spotlightColour: string;
  debug: boolean;
  playerState: string;
  walkSpeed: number;
  cameraPOV: ControlMode;
}

export class Game {
  public readonly controls: GameControls = {
    spotlightColour: '#FFFFFF',
    debug: false,
    playerState: '',
    walkSpeed: 0.3,
    cameraPOV: 'orbit'
  };

  private readonly gui = new GUI();
  private readonly scene = new THREE.Scene();
  private readonly renderer = new THREE.WebGLRenderer();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly cameraRig: CameraRig;
  private readonly spotlight = new THREE.SpotLight(0xffffff);
  private readonly ambient = new THREE.AmbientLight(0xeeeeee);
  private readonly stats = new Stats();

  private width = window.innerWidth;
  private height = window.innerHeight;
  private lastAnimateTime = 0;

  private landTexture!: THREE.Texture;
  private player!: Player;
  private inputs!: InputManager;
  private scenery!: SceneryManager;
  private audio!: AudioManager;

  private models: Map<string, ModelDefinition> = new Map();
  private multiplayer?: MultiplayerClient;
  private readonly remotePlayers = new Map<string, RemotePlayer>();
  private playerId: string | null = null;
  private guiVisible = false;
  private walkAudioPlaying = false;
  private jumpHeld = false;
  private readonly tempForward = new THREE.Vector3();
  private readonly tempRight = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly cameraTarget = new THREE.Vector3();
  private readonly cameraOffsetOrbit = new THREE.Vector3(0, 2.5, 0);
  private readonly cameraOffsetChase = new THREE.Vector3(0, 3.4, 0);
  private readonly chaseLookAhead = 2.6;
  private readonly forwardVector = new THREE.Vector3();
  private savedWorldRigState: { distance: number; pitch: number; yaw: number } | null = null;
  private lastSavedCameraDistance = 0;

  constructor(private readonly outputSelector = '#output', private readonly statsSelector = '#stats') {
    this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 1, 2000);
    this.cameraRig = createCameraRig(this.scene, this.camera);
    this.cameraRig.setYaw(Math.PI * 0.25);

    this.handleResize = this.handleResize.bind(this);
  }

  async start(): Promise<void> {
    this.setupGui();
    this.setupRenderer();
    this.setupLighting();
    this.setupLand();
    this.setupSkybox();
    this.setupStats();

    await this.initCharacters();

    this.scenery = new SceneryManager(this.scene);
    await this.scenery.load();

    this.audio = new AudioManager(this.camera);
    await this.audio.load();

    this.inputs = new InputManager(this.toggleCamera, this.toggleGuiVisibility);
    this.inputs.bindCameraRig(this.cameraRig);
    this.inputs.register();
    this.updateCameraViewLabel();
    this.setGuiVisibility(false);
    this.inputs.attachToGui(this.gui);

    window.addEventListener('resize', this.handleResize);

    this.multiplayer = new MultiplayerClient(this);
    this.multiplayer.connect();

    requestAnimationFrame(this.animate);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.inputs?.dispose();
    this.multiplayer?.dispose();
    this.clearRemotePlayers();
    this.gui.destroy();
  }

  get sceneRef(): THREE.Scene {
    return this.scene;
  }

  get audioManager(): AudioManager {
    return this.audio;
  }

  get walkSpeed(): number {
    return this.controls.walkSpeed;
  }

  getPlayer(): Player {
    return this.player;
  }

  getModel(name: string): ModelDefinition | undefined {
    return this.models.get(name);
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getGui(): GUI {
    return this.gui;
  }

  getStats(): Stats {
    return this.stats;
  }

  private setupGui(): void {
    this.gui.domElement.classList.add('gui-overlay');
    this.gui.addColor(this.controls, 'spotlightColour').onChange(value => {
      this.spotlight.color.setStyle(value);
    });

    this.gui.add(this.controls, 'debug').onChange(value => {
      Character.each(character => {
        character.setDebugVisible(value);
      });
    });

    this.gui.add(this.controls, 'walkSpeed', 0, 1);
    this.gui.add(this.controls, 'playerState').listen();
    this.gui
      .add(this.controls, 'cameraPOV', { Orbit: 'orbit', Chase: 'chase' })
      .name('Camera View')
      .onChange((value: ControlMode) => {
        this.setCameraMode(value);
      });
  }

  private setupRenderer(): void {
    this.cameraRig.setDistance(7);
    this.cameraRig.setPitch(THREE.MathUtils.degToRad(35));
    this.loadCameraDistance();
    this.lastSavedCameraDistance = this.cameraRig.getDistance();

    this.renderer.setSize(this.width, this.height);

    const output = document.querySelector(this.outputSelector);
    if (!output) {
      throw new Error(`Output element ${this.outputSelector} not found`);
    }

    output.appendChild(this.renderer.domElement);
  }

  private setupLighting(): void {
    this.spotlight.position.set(-10, 60, 10);
    this.scene.add(this.spotlight);
    this.scene.add(this.ambient);
  }

  private setupLand(): void {
    const loader = new THREE.TextureLoader();
    this.landTexture = loader.load('/assets/textures/grasslight-big.jpg');
    this.landTexture.wrapS = this.landTexture.wrapT = THREE.RepeatWrapping;
    this.landTexture.repeat.set(50, 50);
    this.landTexture.anisotropy = 16;

    const landGeometry = new THREE.PlaneGeometry(1000, 1000);
    const landMaterial = new THREE.MeshLambertMaterial({ map: this.landTexture });

    const land = new THREE.Mesh(landGeometry, landMaterial);
    land.rotation.x = -0.5 * Math.PI;

    this.scene.add(land);
  }

  private setupSkybox(): void {
    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
      '/assets/backgrounds/sky/xpos.png',
      '/assets/backgrounds/sky/xneg.png',
      '/assets/backgrounds/sky/ypos.png',
      '/assets/backgrounds/sky/yneg.png',
      '/assets/backgrounds/sky/zpos.png',
      '/assets/backgrounds/sky/zneg.png'
    ]);

    this.scene.background = texture;
  }

  private setupStats(): void {
    const statsContainer = document.querySelector(this.statsSelector);
    if (!statsContainer) {
      throw new Error(`Stats element ${this.statsSelector} not found`);
    }

    statsContainer.appendChild(this.stats.dom);
  }

  private async initCharacters(): Promise<void> {
    const loader = new GLTFLoader();
    const definitions = this.buildModelDefinitions();

    await Promise.all(
      definitions.map(async definition => {
        const gltf = await loader.loadAsync(definition.url);
        definition.name = definition.name || definition.url;
        definition.gltf = gltf;
        definition.animations = {};

        gltf.animations.forEach(clip => {
          const clipName = clip.name.toLowerCase();
          const processed = clip.clone();

          if (clipName === 'walk' || clipName === 'walkslow') {
            processed.duration /= 2;
          }

          definition.animations![clipName] = processed;
        });

        definition.process?.(gltf);
        this.models.set(definition.name, definition);
      })
    );

    const playerModel = this.models.get('cow');
    if (!playerModel) {
      throw new Error('Player model not loaded');
    }

    this.player = new Player(this, 'player', playerModel, { position: new THREE.Vector3(0, 0, 0) });
    this.updateCameraRigTarget();

    const modelNames = Array.from(this.models.keys());
    for (let i = 0; i < 20; i += 1) {
      const name = modelNames[Math.floor(Math.random() * modelNames.length)];
      const model = this.models.get(name);
      if (!model) {
        continue;
      }

      const position = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(100),
        0,
        THREE.MathUtils.randFloatSpread(100)
      );

      new Character(this, `${name}-${i}`, model, { position });
    }
  }

  private buildModelDefinitions(): ModelDefinition[] {
    const definitions: ModelDefinition[] = [
      { name: 'cow', url: '/assets/models/characters/Cow.gltf' },
      { name: 'pug', url: '/assets/models/characters/Pug.gltf' },
      { name: 'llama', url: '/assets/models/characters/Llama.gltf' },
      { name: 'zebra', url: '/assets/models/characters/Zebra.gltf' },
      { name: 'horse', url: '/assets/models/characters/Horse.gltf' },
      { name: 'pig', url: '/assets/models/characters/Pig.gltf' },
      { name: 'sheep', url: '/assets/models/characters/Sheep.gltf' },
      {
        name: 'skeleton',
        url: '/assets/models/characters/Skeleton.gltf',
        process: gltf => {
          gltf.scene.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              const updated = materials.map(material => {
                if (material instanceof THREE.MeshStandardMaterial) {
                  const clone = material.clone();
                  clone.metalness = 0;
                  clone.color.setRGB(0.7, 0.7, 0.5);
                  return clone;
                }
                return material;
              });

              mesh.material = Array.isArray(mesh.material) ? updated : updated[0];
            }
          });
        }
      }
    ];

    return definitions;
  }

  setLocalPlayerId(id: string): void {
    this.playerId = id;
  }

  buildSnapshot(id: string): PlayerSnapshot {
    const position = this.player.object.position;
    const rotation = this.player.object.rotation;
    const currentState = this.player.getCurrentState() || this.player.getActiveAnimation()?.name || 'idle';
    const active = this.player.getActiveAnimation();
    const timeScale = active?.timeScale ?? 1;
    const walkSpeedFactor = this.walkSpeed === 0 ? 0 : this.player.getSpeed() / this.walkSpeed;

    return {
      id,
      position: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z],
      state: currentState,
      timeScale,
      walkSpeed: walkSpeedFactor,
      model: this.player.modelName,
      timestamp: performance.now()
    };
  }

  applyRemoteSnapshot(snapshot: PlayerSnapshot): void {
    if (snapshot.id === this.playerId) {
      return;
    }

    const model = this.models.get(snapshot.model) || this.models.get('cow');
    if (!model) {
      return;
    }

    let remote = this.remotePlayers.get(snapshot.id);
    if (!remote) {
      remote = new RemotePlayer(this, `remote-${snapshot.id}`, model, {
        position: new THREE.Vector3(...snapshot.position)
      });
      this.remotePlayers.set(snapshot.id, remote);
    }

    remote.applySnapshot(snapshot);
  }

  removeRemotePlayer(id: string): void {
    const remote = this.remotePlayers.get(id);
    if (!remote) {
      return;
    }

    remote.destroy();
    this.remotePlayers.delete(id);
  }

  clearRemotePlayers(): void {
    this.remotePlayers.forEach(remote => remote.destroy());
    this.remotePlayers.clear();
  }

  private animate = (now: number): void => {
    const seconds = now * 0.001;
    const deltaTime = seconds - this.lastAnimateTime;
    this.lastAnimateTime = seconds;

    this.inputs.update(deltaTime);
    const input = this.inputs.read();
    this.updateCameraRigTarget();
    this.applyInput(input);
    this.cameraRig.enforceGround(0, 0.2);
    this.persistCameraDistance();

    this.player.update(deltaTime);
    Character.each(character => {
      if (character !== this.player) {
        character.update(deltaTime);
      }
    });

    this.multiplayer?.update(seconds);

    this.stats.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  };

  private applyInput(input: InputState): void {
    if (!this.player) {
      return;
    }

    if (input.lookDelta.x !== 0 || input.lookDelta.y !== 0) {
      this.cameraRig.rotate(-input.lookDelta.x, -input.lookDelta.y);
    }

    if (input.lookDelta.x !== 0) {
      this.player.object.rotateY(-input.lookDelta.x);
    }

    if (Math.abs(input.move.x) > 0.05) {
      this.applyStrafe(input.move.x);
    }

    if (input.actions.jump && !this.jumpHeld) {
      this.jumpHeld = true;
      this.audio.setPlaybackRate('walk', 0.5);
      this.audio.play('walk');
      this.player.changeState('jump', { force: true });
    } else if (!input.actions.jump && this.jumpHeld) {
      this.jumpHeld = false;
      this.audio.stop('walk');
      this.walkAudioPlaying = false;
    }

    if (this.jumpHeld) {
      return;
    }

    const forward = clamp(input.move.y, -1, 1);
    const moving = Math.abs(forward) > 0.05;

    if (moving) {
      const magnitude = Math.abs(forward);
      const direction = Math.sign(forward) || 1;
      const timeScale = direction * Math.max(0.5, magnitude);
      this.player.changeState('walk', { walkSpeed: forward, timeScale, force: true });
      this.audio.setPlaybackRate('walk', Math.abs(timeScale));
      if (!this.walkAudioPlaying) {
        this.audio.play('walk');
        this.walkAudioPlaying = true;
      }
    } else {
      if (this.player.getCurrentState() !== 'idle') {
        this.player.changeState('idle');
      }
      if (this.walkAudioPlaying) {
        this.audio.stop('walk');
        this.walkAudioPlaying = false;
      }
    }
  }

  private updateCameraRigTarget(): void {
    if (!this.player) {
      return;
    }

    const offset = this.controls.cameraPOV === 'chase' ? this.cameraOffsetChase : this.cameraOffsetOrbit;
    this.cameraTarget.copy(this.player.object.position).add(offset);
    if (this.controls.cameraPOV === 'chase') {
      this.forwardVector.set(0, 0, -1).applyQuaternion(this.player.object.quaternion).normalize();
      this.cameraTarget.addScaledVector(this.forwardVector, this.chaseLookAhead);
      const yaw = Math.atan2(-this.forwardVector.x, -this.forwardVector.z);
      this.cameraRig.setYaw(yaw);
    }
    this.cameraRig.setTarget(this.cameraTarget);
  }

  private loadCameraDistance(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const raw = localStorage.getItem(CAMERA_DISTANCE_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed)) {
        this.cameraRig.setDistance(parsed);
      }
    } catch (error) {
      console.warn('Failed to load camera distance', error);
    }
  }

  private persistCameraDistance(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    if (this.controls.cameraPOV !== 'orbit') {
      return;
    }

    const current = this.cameraRig.getDistance();
    if (Math.abs(current - this.lastSavedCameraDistance) < 0.05) {
      return;
    }

    try {
      localStorage.setItem(CAMERA_DISTANCE_STORAGE_KEY, current.toFixed(3));
      this.lastSavedCameraDistance = current;
    } catch (error) {
      console.warn('Failed to persist camera distance', error);
    }
  }

  private applyStrafe(amount: number): void {
    const clamped = clamp(amount, -1, 1);
    if (Math.abs(clamped) < 0.05) {
      return;
    }

    this.player.object.getWorldDirection(this.tempForward);
    this.tempRight.copy(this.tempForward).cross(this.up).normalize();
    this.player.object.position.addScaledVector(this.tempRight, clamped * this.walkSpeed);
  }

  private toggleCamera = (): void => {
    const next = this.controls.cameraPOV === 'orbit' ? 'chase' : 'orbit';
    this.setCameraMode(next);
  };

  private setCameraMode(mode: ControlMode): void {
    if (!this.player) {
      this.controls.cameraPOV = mode;
      this.updateCameraViewLabel();
      return;
    }

    if (this.controls.cameraPOV === mode) {
      this.updateCameraViewLabel();
      return;
    }

    if (mode === 'chase') {
      this.savedWorldRigState = {
        distance: this.cameraRig.getDistance(),
        pitch: this.cameraRig.getPitch(),
        yaw: this.cameraRig.getYaw()
      };
      this.forwardVector.set(0, 0, -1).applyQuaternion(this.player.object.quaternion).normalize();
      const yaw = Math.atan2(-this.forwardVector.x, -this.forwardVector.z);
      this.cameraRig.setYaw(yaw);
      this.cameraRig.setPitch(THREE.MathUtils.degToRad(22));
      this.cameraRig.setDistance(4.5);
    } else if (this.savedWorldRigState) {
      this.cameraRig.setYaw(this.savedWorldRigState.yaw);
      this.cameraRig.setPitch(this.savedWorldRigState.pitch);
      this.cameraRig.setDistance(this.savedWorldRigState.distance);
      this.savedWorldRigState = null;
    } else {
      this.cameraRig.setYaw(Math.PI * 0.25);
      this.cameraRig.setPitch(THREE.MathUtils.degToRad(35));
      this.cameraRig.setDistance(7);
    }

    this.controls.cameraPOV = mode;
    this.updateCameraRigTarget();
    this.cameraRig.enforceGround(0, 0.2);
    this.updateCameraViewLabel();
  }

  private updateCameraViewLabel(): void {
    const label = this.controls.cameraPOV === 'orbit' ? 'Orbit' : 'Chase';
    this.inputs?.setCameraViewLabel(label);
  }

  private setGuiVisibility(visible: boolean): void {
    this.guiVisible = visible;
    const guiWithVisibility = this.gui as GUI & { hide?: () => void; show?: () => void };
    if (visible) {
      if (guiWithVisibility.show) {
        guiWithVisibility.show();
      } else {
        this.gui.domElement.style.display = '';
      }
      this.gui.domElement.classList.add('gui-visible');
      this.inputs.setMobileInteractivity(false);
    } else if (guiWithVisibility.hide) {
      guiWithVisibility.hide();
      this.gui.domElement.classList.remove('gui-visible');
      this.inputs.setMobileInteractivity(true);
    } else {
      this.gui.domElement.style.display = 'none';
      this.gui.domElement.classList.remove('gui-visible');
      this.inputs.setMobileInteractivity(true);
    }
  }

  private toggleGuiVisibility = (): void => {
    this.setGuiVisibility(!this.guiVisible);
  };

  private handleResize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

}
