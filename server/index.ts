import express from 'express';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';

type PlayerSnapshot = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  state: string;
  timeScale: number;
  walkSpeed: number;
  model: string;
  timestamp: number;
};

type ClientMessage =
  | { type: 'join'; room?: string | null }
  | { type: 'state'; player: PlayerSnapshot }
  | { type: 'ping'; timestamp: number };

type ServerMessage =
  | { type: 'init'; id: string; roomId: string; players: PlayerSnapshot[] }
  | { type: 'player-update'; player: PlayerSnapshot }
  | { type: 'player-leave'; id: string }
  | { type: 'pong'; timestamp: number };

interface ClientRecord {
  id: string;
  socket: WebSocket;
  snapshot: PlayerSnapshot | null;
  roomId: string;
  joined: boolean;
}

const PORT = Number(process.env.MULTIPLAYER_PORT ?? process.env.PORT ?? 3001);
const DEFAULT_ROOM = process.env.MULTIPLAYER_ROOM ?? 'dev-room';
const PATH = process.env.MULTIPLAYER_PATH ?? process.env.MULTIPLAYER_WS_PATH ?? '/ws';

const clients = new Map<string, ClientRecord>();

const normalisePath = (value: string): string => (value.startsWith('/') ? value : `/${value}`);

const app = express();
const server = createServer(app);

const wss = new WebSocketServer({
  server,
  path: normalisePath(PATH)
});

function peersInRoom(roomId: string, excludeId?: string): ClientRecord[] {
  return Array.from(clients.values()).filter(client => {
    if (excludeId && client.id === excludeId) {
      return false;
    }
    return client.joined && client.roomId === roomId && client.socket.readyState === WebSocket.OPEN;
  });
}

function playersInRoom(roomId: string, excludeId?: string): PlayerSnapshot[] {
  return Array.from(clients.values())
    .filter(client => client.joined && client.snapshot && client.roomId === roomId && client.id !== excludeId)
    .map(client => client.snapshot!)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function broadcast(message: ServerMessage, roomId: string, excludeId?: string): void {
  const payload = JSON.stringify(message);
  for (const client of peersInRoom(roomId, excludeId)) {
    client.socket.send(payload);
  }
}

wss.on('connection', socket => {
  const id = randomUUID();
  const record: ClientRecord = { id, socket, snapshot: null, roomId: DEFAULT_ROOM, joined: false };
  clients.set(id, record);

  console.info(`[multiplayer] client connected: ${id}`);

  socket.on('message', data => {
    try {
      const parsed = JSON.parse(data.toString()) as ClientMessage;

      switch (parsed.type) {
        case 'join': {
          const nextRoom = parsed.room?.trim() || DEFAULT_ROOM;
          const previousRoom = record.roomId;

          if (previousRoom !== nextRoom && record.snapshot) {
            broadcast({ type: 'player-leave', id }, previousRoom, id);
            record.snapshot = null;
          }

          record.roomId = nextRoom;
          record.joined = true;

          const otherPlayers = playersInRoom(record.roomId, id);

          const initMessage: ServerMessage = { type: 'init', id, roomId: record.roomId, players: otherPlayers };
          socket.send(JSON.stringify(initMessage));
          break;
        }

        case 'state': {
          if (!record.joined) {
            break;
          }

          const snapshot: PlayerSnapshot = { ...parsed.player, id };
          record.snapshot = snapshot;
          broadcast({ type: 'player-update', player: snapshot }, record.roomId, id);
          break;
        }

        case 'ping':
          socket.send(JSON.stringify({ type: 'pong', timestamp: parsed.timestamp }));
          break;

        default:
          console.warn('[multiplayer] unknown client message', parsed);
      }
    } catch (error) {
      console.error('[multiplayer] failed to process client message', error);
    }
  });

  socket.on('close', () => {
    console.info(`[multiplayer] client disconnected: ${id}`);
    clients.delete(id);
    if (record.joined) {
      broadcast({ type: 'player-leave', id }, record.roomId, id);
    }
  });

  socket.on('error', error => {
    console.error('[multiplayer] socket error', error);
  });
});
app.get('/debug/rooms', (_req, res) => {
  const byRoom: Record<string, string[]> = {};
  for (const client of clients.values()) {
    const room = client.roomId ?? DEFAULT_ROOM;
    (byRoom[room] ??= []).push(client.id);
  }
  res.json(byRoom);
});

server.listen(PORT, '0.0.0.0', () => {
  console.info(`[multiplayer] listening on ws://0.0.0.0:${PORT}${normalisePath(PATH)}`);
});
