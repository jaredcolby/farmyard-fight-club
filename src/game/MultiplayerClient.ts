import type { ClientMessage, MultiplayerOptions, PlayerSnapshot, ServerMessage } from './types';
import type { Game } from './Game';

const DEFAULT_UPDATE_INTERVAL_MS = 120;

export class MultiplayerClient {
  private socket: WebSocket | null = null;
  private readonly options: Required<MultiplayerOptions>;
  private playerId: string | null = null;
  private lastSentAt = 0;

  constructor(private readonly game: Game, options: Partial<MultiplayerOptions> = {}) {
    const url = options.url ?? (import.meta.env.VITE_MULTIPLAYER_URL ?? 'ws://localhost:3001');
    const updateIntervalMs = options.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS;
    this.options = { url, updateIntervalMs };
  }

  connect(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.dispose();

    try {
      this.socket = new WebSocket(this.options.url);
      this.socket.addEventListener('open', this.handleOpen);
      this.socket.addEventListener('message', this.handleMessage);
      this.socket.addEventListener('close', this.handleClose);
      this.socket.addEventListener('error', this.handleError);
    } catch (error) {
      console.error('Failed to connect to multiplayer server', error);
    }
  }

  update(currentSeconds: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.playerId) {
      return;
    }

    const nowMs = currentSeconds * 1000;
    if (nowMs - this.lastSentAt < this.options.updateIntervalMs) {
      return;
    }

    const snapshot = this.game.buildSnapshot(this.playerId);
    const message: ClientMessage = { type: 'state', player: snapshot };

    try {
      this.socket.send(JSON.stringify(message));
      this.lastSentAt = nowMs;
    } catch (error) {
      console.error('Failed to send multiplayer update', error);
    }
  }

  dispose(): void {
    if (!this.socket) {
      return;
    }

    this.socket.removeEventListener('open', this.handleOpen);
    this.socket.removeEventListener('message', this.handleMessage);
    this.socket.removeEventListener('close', this.handleClose);
    this.socket.removeEventListener('error', this.handleError);

    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }

    this.socket = null;
    this.playerId = null;
    this.lastSentAt = 0;
  }

  private handleOpen = (): void => {
    console.info('[multiplayer] connected');
  };

  private handleClose = (): void => {
    console.info('[multiplayer] disconnected');
    this.playerId = null;
    this.game.clearRemotePlayers();
  };

  private handleError = (event: Event): void => {
    console.error('[multiplayer] socket error', event);
  };

  private handleMessage = (event: MessageEvent<string>): void => {
    try {
      const payload = JSON.parse(event.data) as ServerMessage;

      switch (payload.type) {
        case 'init':
          this.playerId = payload.id;
          this.game.setLocalPlayerId(payload.id);
          payload.players.forEach(snapshot => this.game.applyRemoteSnapshot(snapshot));
          break;

        case 'player-update':
          this.game.applyRemoteSnapshot(payload.player);
          break;

        case 'player-leave':
          this.game.removeRemotePlayer(payload.id);
          break;

        case 'pong':
          break;

        default:
          console.warn('[multiplayer] unknown message', payload);
      }
    } catch (error) {
      console.error('[multiplayer] failed to parse message', event.data, error);
    }
  };
}
