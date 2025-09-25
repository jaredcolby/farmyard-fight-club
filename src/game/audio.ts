import * as THREE from 'three';

import type { SoundDefinition } from './types';

interface LoadedSound extends SoundDefinition {
  audio: THREE.Audio;
}

const SOUND_DEFINITIONS: Record<string, SoundDefinition> = {
  walk: { url: '/assets/audio/walk.mp3', loop: true, rate: 0.7 },
  cow: { url: '/assets/audio/cow.mp3' },
  pig: { url: '/assets/audio/pig.mp3' },
  pug: { url: '/assets/audio/dog.mp3' },
  llama: { url: '/assets/audio/llama.mp3' },
  zebra: { url: '/assets/audio/zebra.mp3' },
  sheep: { url: '/assets/audio/sheep.mp3' },
  horse: { url: '/assets/audio/horse.mp3' },
  skeleton: { url: '/assets/audio/skeleton.mp3' }
};

export class AudioManager {
  private readonly listener = new THREE.AudioListener();
  private readonly loader = new THREE.AudioLoader();
  private readonly sounds = new Map<string, LoadedSound>();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.camera.add(this.listener);
  }

  async load(): Promise<void> {
    await Promise.all(
      Object.entries(SOUND_DEFINITIONS).map(async ([name, definition]) => {
        const audio = new THREE.Audio(this.listener);
        const buffer = await this.loader.loadAsync(definition.url);
        audio.setBuffer(buffer);
        audio.setLoop(definition.loop ?? false);
        audio.setVolume(0.5);
        audio.setPlaybackRate(definition.rate ?? 1);
        this.sounds.set(name, { ...definition, audio });
      })
    );
  }

  play(name: string): void {
    const sound = this.sounds.get(name);
    if (!sound) {
      return;
    }

    if (sound.audio.isPlaying) {
      sound.audio.stop();
    }

    sound.audio.play();
  }

  stop(name: string): void {
    this.sounds.get(name)?.audio.stop();
  }

  setPlaybackRate(name: string, rate: number): void {
    const sound = this.sounds.get(name);
    if (!sound) {
      return;
    }

    sound.audio.setPlaybackRate(rate);
  }
}
