import type { AnimationClip, Vector3 } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

export interface ModelDefinition {
  name: string;
  url: string;
  process?: (gltf: GLTF) => void;
  gltf?: GLTF;
  animations?: Record<string, AnimationClip>;
}

export interface CharacterOptions {
  position?: Vector3;
  rotation?: Vector3;
}

export interface CharacterState {
  action: string;
  lastAction: string;
  velocity: Vector3;
  speed: number;
}

export interface SoundDefinition {
  url: string;
  loop?: boolean;
  rate?: number;
}

export type ControlMode = 'world' | 'player';

export type CharacterKind = 'npc' | 'player' | 'remote';

export interface PlayerSnapshot {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  state: string;
  timeScale: number;
  walkSpeed: number;
  model: string;
  timestamp: number;
}

export type ServerMessage =
  | { type: 'init'; id: string; roomId: string; players: PlayerSnapshot[] }
  | { type: 'player-update'; player: PlayerSnapshot }
  | { type: 'player-leave'; id: string }
  | { type: 'pong'; timestamp: number };

export type ClientMessage =
  | { type: 'join'; room: string }
  | { type: 'state'; player: PlayerSnapshot }
  | { type: 'ping'; timestamp: number };

export interface MultiplayerOptions {
  url: string;
  updateIntervalMs?: number;
}
