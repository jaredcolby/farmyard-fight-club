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

type ClientMessage = { type: 'state'; player: PlayerSnapshot } | { type: 'ping'; timestamp: number };

type ServerMessage =
  | { type: 'init'; id: string; players: PlayerSnapshot[] }
  | { type: 'player-update'; player: PlayerSnapshot }
  | { type: 'player-leave'; id: string }
  | { type: 'pong'; timestamp: number };

interface ClientRecord {
  id: string;
  socket: WebSocket;
  snapshot: PlayerSnapshot | null;
}

const PORT = Number(process.env.MULTIPLAYER_PORT ?? process.env.PORT ?? 3001);

const clients = new Map<string, ClientRecord>();

const wss = new WebSocketServer({ port: PORT });

function broadcast(message: ServerMessage, excludeId?: string): void {
  const payload = JSON.stringify(message);
  for (const [id, client] of clients.entries()) {
    if (excludeId && id === excludeId) {
      continue;
    }

    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(payload);
    }
  }
}

wss.on('connection', socket => {
  const id = randomUUID();
  const record: ClientRecord = { id, socket, snapshot: null };
  clients.set(id, record);

  console.info(`[multiplayer] client connected: ${id}`);

  const otherPlayers = Array.from(clients.values())
    .filter(client => client.snapshot && client.id !== id)
    .map(client => client.snapshot!)
    .sort((a, b) => a.timestamp - b.timestamp);

  const initMessage: ServerMessage = { type: 'init', id, players: otherPlayers };
  socket.send(JSON.stringify(initMessage));

  socket.on('message', data => {
    try {
      const parsed = JSON.parse(data.toString()) as ClientMessage;

      switch (parsed.type) {
        case 'state': {
          const snapshot: PlayerSnapshot = { ...parsed.player, id };
          record.snapshot = snapshot;
          broadcast({ type: 'player-update', player: snapshot }, id);
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
    broadcast({ type: 'player-leave', id }, id);
  });

  socket.on('error', error => {
    console.error('[multiplayer] socket error', error);
  });
});

wss.on('listening', () => {
  console.info(`[multiplayer] listening on ws://localhost:${PORT}`);
});
