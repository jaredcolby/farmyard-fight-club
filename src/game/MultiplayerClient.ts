import type { ClientMessage, MultiplayerOptions, PlayerSnapshot, ServerMessage } from './types';
import type { Game } from './Game';
import { makeWsUrl } from '../net/ws-url';
import { ROOM_ID } from '../net/room';

const DEFAULT_UPDATE_INTERVAL_MS = 120;

export class MultiplayerClient {
  private socket: WebSocket | null = null;
  private readonly options: Required<MultiplayerOptions>;
  private playerId: string | null = null;
  private lastSentAt = 0;
  private readonly roomId = ROOM_ID;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressReconnect = false;

  constructor(private readonly game: Game, options: Partial<MultiplayerOptions> = {}) {
    const url = options.url ?? makeWsUrl();
    const updateIntervalMs = options.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS;
    this.options = { url, updateIntervalMs };
  }

  connect(): void {
    if (typeof window === 'undefined') {
      return;
    }

    console.log('[room]', this.roomId, window.location.href);

    this.dispose();
    this.clearReconnectTimer();

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
    this.clearReconnectTimer();

    if (!this.socket) {
      return;
    }

    this.suppressReconnect = true;

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
    if (!this.socket) {
      return;
    }

    this.clearReconnectTimer();
    this.lastSentAt = 0;
    const joinMessage: ClientMessage = { type: 'join', room: this.roomId };

    try {
      console.log('[ws] open → join room', this.roomId);
      this.socket.send(JSON.stringify(joinMessage));
    } catch (error) {
      console.error('[multiplayer] failed to send join message', error);
    }
  };

  private handleClose = (): void => {
    console.info('[multiplayer] disconnected');
    this.socket = null;
    this.playerId = null;
    this.game.clearRemotePlayers();

    if (this.suppressReconnect) {
      this.suppressReconnect = false;
      return;
    }

    this.scheduleReconnect();
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
          if (payload.roomId !== this.roomId) {
            console.warn('[multiplayer] joined unexpected room', payload.roomId, 'expected', this.roomId);
          }
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

  private scheduleReconnect(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.reconnectTimer !== null) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 500);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
