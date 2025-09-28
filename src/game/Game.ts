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
import { CameraRig } from './camera/CameraRig';
import { MobileDualSticks } from './controls/MobileDualSticks';
import { getCameraMode, initControls, setCameraMode, shouldShowJoysticks } from '../settings/controls';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

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
    cameraPOV: 'world'
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
  private mobileSticks: MobileDualSticks | null = null;
  private readonly debugMobile = new URLSearchParams(window.location.search).get('debug') === '1';

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

  constructor(private readonly outputSelector = '#output', private readonly statsSelector = '#stats') {
    this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 1, 2000);
    this.cameraRig = new CameraRig(this.camera);

    this.handleResize = this.handleResize.bind(this);
  }

  async start(): Promise<void> {
    initControls();
    this.setupGui();
    this.setupRenderer();
    this.setupLighting();
    this.setupLand();
    this.setupSkybox();
    this.setupStats();

    this.cameraRig.attachTo(this.scene);
    this.cameraRig.setMode(getCameraMode());

    await this.initCharacters();
    this.cameraRig.setFollowTarget(this.player.object);
    this.cameraRig.setYaw(this.player.object.rotation.y);

    this.scenery = new SceneryManager(this.scene);
    await this.scenery.load();

    this.audio = new AudioManager(this.camera);
    await this.audio.load();

    this.inputs = new InputManager(this.toggleCamera, this.toggleGuiVisibility);
    this.inputs.register();
    this.setGuiVisibility(false);

    if (shouldShowJoysticks()) {
      this.mobileSticks = new MobileDualSticks({
        debug: this.debugMobile,
        onToggleCamera: this.toggleCamera,
        onToggleMenu: this.toggleGuiVisibility
      });
    }

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
    this.mobileSticks?.dispose();
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
  }

  private setupRenderer(): void {
    this.camera.position.set(11, 6, 18);
    this.camera.lookAt(this.scene.position);

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
    const rawDelta = seconds - this.lastAnimateTime;
    this.lastAnimateTime = seconds;
    const deltaTime = Math.min(Math.max(rawDelta, 0), 0.1);

    const input = this.inputs.read();

    let mobileMagnitude = 0;
    let mobileCameraInput = false;
    if (this.mobileSticks) {
      this.mobileSticks.update(deltaTime);
      const mobileActions = this.mobileSticks.getActions();
      input.actions.primary = input.actions.primary || mobileActions.primary;
      input.actions.secondary = input.actions.secondary || mobileActions.secondary;
      input.actions.jump = input.actions.jump || mobileActions.jump;
      mobileMagnitude = this.mobileSticks.applyMovement(this.player, this.cameraRig, deltaTime);
      mobileCameraInput = this.mobileSticks.applyCamera(this.player, this.cameraRig, deltaTime) || mobileCameraInput;
    }

    const desktopCameraInput = this.applyInput(input, deltaTime, mobileMagnitude);
    const hasCameraInput = mobileCameraInput || desktopCameraInput;

    const forwardMoving = this.player ? this.player.getSpeed() > 0.05 : false;
    const lateralMoving = mobileMagnitude <= 0 && Math.abs(input.move.x) > 0.05;
    const isMoving = forwardMoving || lateralMoving;
    const desiredForwardYaw = this.player ? this.player.object.rotation.y : this.cameraRig.getYaw();

    this.cameraRig.tick(deltaTime, {
      hasCamInput: hasCameraInput,
      isMoving,
      desiredForwardYaw
    });
    this.mobileSticks?.afterCameraUpdate(this.player, this.cameraRig, deltaTime);

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

  private applyInput(input: InputState, _deltaTime: number, mobileMagnitude: number): boolean {
    if (!this.player) {
      return false;
    }

    let usedCameraInput = false;

    if (input.lookDelta.x !== 0) {
      this.cameraRig.addYaw(-input.lookDelta.x);
      usedCameraInput = true;
    }

    if (input.lookDelta.y !== 0) {
      this.cameraRig.addPitch(input.lookDelta.y);
      usedCameraInput = true;
    }

    if (mobileMagnitude <= 0 && Math.abs(input.move.x) > 0.05) {
      this.applyStrafe(input.move.x);
    }

    if (input.actions.jump && !this.jumpHeld) {
      this.jumpHeld = true;
      this.handleWalkAudio(0.5);
      this.player.changeState('jump', { force: true });
    } else if (!input.actions.jump && this.jumpHeld) {
      this.jumpHeld = false;
      this.stopWalkAudio();
    }

    if (this.jumpHeld) {
      return usedCameraInput;
    }

    if (mobileMagnitude > 0) {
      const intensity = clamp(mobileMagnitude, 0, 1);
      const timeScale = Math.max(0.5, intensity);
      this.player.changeState('walk', { walkSpeed: intensity, timeScale, force: true });
      this.handleWalkAudio(timeScale);
      return usedCameraInput;
    }

    const forward = clamp(input.move.y, -1, 1);
    const moving = Math.abs(forward) > 0.05;

    if (moving) {
      const magnitude = Math.abs(forward);
      const direction = Math.sign(forward) || 1;
      const timeScale = direction * Math.max(0.5, magnitude);
      this.player.changeState('walk', { walkSpeed: forward, timeScale, force: true });
      this.handleWalkAudio(Math.abs(timeScale));
    } else {
      this.stopWalkAudio();
      if (this.player.getCurrentState() !== 'idle') {
        this.player.changeState('idle');
      }
    }

    return usedCameraInput;
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

  private handleWalkAudio(rate: number): void {
    this.audio.setPlaybackRate('walk', rate);
    if (!this.walkAudioPlaying) {
      this.audio.play('walk');
      this.walkAudioPlaying = true;
    }
  }

  private stopWalkAudio(): void {
    if (!this.walkAudioPlaying) {
      return;
    }
    this.audio.stop('walk');
    this.walkAudioPlaying = false;
  }

  private toggleCamera = (): void => {
    const current = getCameraMode();
    const next = current === 'chase' ? 'fpv' : 'chase';
    setCameraMode(next);
    this.cameraRig.setMode(next);
    this.controls.cameraPOV = next === 'chase' ? 'world' : 'player';
  };

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
      this.mobileSticks?.setInteractive(false);
    } else if (guiWithVisibility.hide) {
      guiWithVisibility.hide();
      this.gui.domElement.classList.remove('gui-visible');
      this.mobileSticks?.setInteractive(true);
    } else {
      this.gui.domElement.style.display = 'none';
      this.gui.domElement.classList.remove('gui-visible');
      this.mobileSticks?.setInteractive(true);
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
