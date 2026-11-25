import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { env } from '../env';
import { getAccessTokenAuthState } from '../lib/sessionStore';
import { findActiveAuthUser } from '../middleware/auth';
import { WebSocket, WebSocketServer } from 'ws';
import { consumeRealtimeTicket, type RealtimeTicketIdentity } from './tickets';

const WS_PATH = '/api/v1/realtime/ws';
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_PAYLOAD_BYTES = 1024;
type NotificationPublisher = (tenantId: string, userId: string, event: string) => Promise<void>;
const notificationPublishers = new Set<NotificationPublisher>();

type TrackedSocket = WebSocket & { isAlive: boolean };

type RealtimeServerOptions = {
  enabled?: boolean;
  clientUrl?: string;
  heartbeatIntervalMs?: number;
};

export async function publishNotificationCreated(
  tenantId: string,
  userId: string,
  occurredAt: Date,
): Promise<void> {
  const event = JSON.stringify({
    v: 1,
    type: 'notification.created',
    eventId: randomUUID(),
    occurredAt: occurredAt.toISOString(),
  });
  await Promise.all(
    [...notificationPublishers].map(async (publish) => {
      try {
        await publish(tenantId, userId, event);
      } catch {
        // Realtime delivery is best effort; the persisted notification is authoritative.
      }
    }),
  );
}

function rejectUpgrade(socket: Duplex, status: 401 | 403 | 404 | 503): void {
  if (socket.destroyed || socket.writableEnded) return;
  const reason = {
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    503: 'Service Unavailable',
  }[status];
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    () => socket.destroy(),
  );
}

function parseTicketProtocol(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;
  const protocols = header.split(',').map((value) => value.trim());
  if (protocols.length !== 2 || protocols.filter((value) => value === 'taskflow.v1').length !== 1) {
    return null;
  }
  const ticketProtocol = protocols.find((value) => value.startsWith('ticket.'));
  if (!ticketProtocol) return null;
  const ticket = ticketProtocol.slice('ticket.'.length);
  return /^[A-Za-z0-9_-]{43}$/.test(ticket) ? ticket : null;
}

async function isIdentityActive(identity: RealtimeTicketIdentity): Promise<boolean> {
  const authState = await getAccessTokenAuthState(identity.jti);
  if (authState.blacklisted || !authState.hasSession) return false;
  const user = await findActiveAuthUser(identity.userId);
  return Boolean(user && user.tenantId === identity.tenantId);
}

export function attachRealtimeServer(
  server: Server,
  options: RealtimeServerOptions = {},
): {
  close: () => Promise<void>;
  connectionsFor: (tenantId: string | null, userId: string) => readonly WebSocket[];
} {
  const enabled = options.enabled ?? env.REALTIME_ENABLED;
  const clientOrigin = new URL(options.clientUrl ?? env.CLIENT_URL).origin;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
    handleProtocols: (protocols) => (protocols.has('taskflow.v1') ? 'taskflow.v1' : false),
  });
  wss.on('error', () => undefined);
  const identities = new Map<TrackedSocket, RealtimeTicketIdentity>();
  const connections = new Map<string, Set<TrackedSocket>>();
  const pendingUpgrades = new Set<Duplex>();
  let heartbeatRunning = false;
  let shuttingDown = false;
  let closePromise: Promise<void> | undefined;

  const removeConnection = (socket: TrackedSocket) => {
    const identity = identities.get(socket);
    if (!identity) return;
    identities.delete(socket);
    const key = JSON.stringify([identity.tenantId, identity.userId]);
    const usersConnections = connections.get(key);
    usersConnections?.delete(socket);
    if (usersConnections?.size === 0) connections.delete(key);
  };

  const publishToRecipient: NotificationPublisher = async (tenantId, userId, event) => {
    const key = JSON.stringify([tenantId, userId]);
    await Promise.all(
      [...(connections.get(key) ?? [])].map(async (socket) => {
        const identity = identities.get(socket);
        if (
          socket.readyState !== WebSocket.OPEN ||
          !identity ||
          identity.tenantId !== tenantId ||
          identity.userId !== userId
        ) {
          return;
        }
        try {
          if (!(await isIdentityActive(identity))) {
            socket.terminate();
            return;
          }
        } catch {
          socket.terminate();
          return;
        }
        if (socket.readyState !== WebSocket.OPEN) return;
        try {
          socket.send(event, (error) => {
            if (error) socket.terminate();
          });
        } catch {
          socket.terminate();
        }
      }),
    );
  };
  notificationPublishers.add(publishToRecipient);

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const onSocketError = () => {
      pendingUpgrades.delete(socket);
      socket.destroy();
    };
    const onSocketClose = () => {
      pendingUpgrades.delete(socket);
      socket.off('error', onSocketError);
    };
    socket.on('error', onSocketError);
    socket.once('close', onSocketClose);
    pendingUpgrades.add(socket);

    void (async () => {
      if (shuttingDown) {
        rejectUpgrade(socket, 503);
        return;
      }
      if (req.url !== WS_PATH || !enabled) {
        rejectUpgrade(socket, 404);
        return;
      }
      if (req.headers.origin !== clientOrigin) {
        rejectUpgrade(socket, 403);
        return;
      }

      const ticket = parseTicketProtocol(req.headers['sec-websocket-protocol']);
      if (!ticket) {
        rejectUpgrade(socket, 401);
        return;
      }

      let identity: RealtimeTicketIdentity | null;
      try {
        identity = await consumeRealtimeTicket(ticket);
      } catch {
        rejectUpgrade(socket, 503);
        return;
      }
      if (shuttingDown || socket.destroyed) {
        rejectUpgrade(socket, 503);
        return;
      }
      if (!identity) {
        rejectUpgrade(socket, 401);
        return;
      }

      try {
        if (!(await isIdentityActive(identity))) {
          rejectUpgrade(socket, 401);
          return;
        }
      } catch {
        rejectUpgrade(socket, 503);
        return;
      }
      if (shuttingDown || socket.destroyed) {
        rejectUpgrade(socket, 503);
        return;
      }

      let upgradedSocket: WebSocket | undefined;
      try {
        wss.handleUpgrade(req, socket, head, (webSocket) => {
          upgradedSocket = webSocket;
          pendingUpgrades.delete(socket);
          socket.off('error', onSocketError);
          socket.off('close', onSocketClose);
          const tracked = webSocket as TrackedSocket;
          tracked.isAlive = true;
          identities.set(tracked, identity);
          const key = JSON.stringify([identity.tenantId, identity.userId]);
          const usersConnections = connections.get(key) ?? new Set<TrackedSocket>();
          usersConnections.add(tracked);
          connections.set(key, usersConnections);
          tracked.on('pong', () => {
            tracked.isAlive = true;
          });
          tracked.on('message', () => {
            tracked.close(1008, 'Control frames only');
          });
          tracked.on('close', () => removeConnection(tracked));
          tracked.on('error', () => undefined);
          wss.emit('connection', tracked, req);
        });
      } catch {
        if (upgradedSocket) upgradedSocket.terminate();
        else rejectUpgrade(socket, 401);
      }
    })().catch(() => rejectUpgrade(socket, shuttingDown ? 503 : 401));
  };

  server.on('upgrade', onUpgrade);

  const heartbeat = setInterval(() => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    void (async () => {
      try {
        for (const client of wss.clients as Set<TrackedSocket>) {
          if (client.readyState !== WebSocket.OPEN) continue;
          const identity = identities.get(client);
          if (!client.isAlive || !identity) {
            client.terminate();
            continue;
          }
          client.isAlive = false;
          try {
            if (!(await isIdentityActive(identity))) {
              client.terminate();
              continue;
            }
          } catch {
            client.terminate();
            continue;
          }
          if (shuttingDown || client.readyState !== WebSocket.OPEN) continue;
          try {
            client.ping();
          } catch {
            client.terminate();
          }
        }
      } finally {
        heartbeatRunning = false;
      }
    })();
  }, heartbeatIntervalMs);
  heartbeat.unref();

  return {
    connectionsFor: (tenantId, userId) => [
      ...(connections.get(JSON.stringify([tenantId, userId])) ?? []),
    ],
    close: () => {
      if (closePromise) return closePromise;
      shuttingDown = true;
      notificationPublishers.delete(publishToRecipient);
      closePromise = (async () => {
        clearInterval(heartbeat);
        server.off('upgrade', onUpgrade);
        const pending = [...pendingUpgrades];
        const drainPending = Promise.all(
          pending.map(
            (socket) =>
              new Promise<void>((resolve) => {
                if (socket.destroyed) return resolve();
                socket.once('close', () => resolve());
              }),
          ),
        );
        for (const socket of pending) rejectUpgrade(socket, 503);
        let pendingDeadline: NodeJS.Timeout | undefined;
        await Promise.race([
          drainPending,
          new Promise<void>((resolve) => {
            pendingDeadline = setTimeout(resolve, 1_000);
          }),
        ]);
        if (pendingDeadline) clearTimeout(pendingDeadline);
        for (const socket of pending) {
          if (!socket.destroyed) socket.destroy();
          pendingUpgrades.delete(socket);
        }

        const clients = [...wss.clients];
        const drain = new Promise<void>((resolve) => {
          if (!clients.length) return resolve();
          let remaining = clients.length;
          for (const client of clients) {
            client.once('close', () => {
              remaining -= 1;
              if (!remaining) resolve();
            });
            client.close(1001, 'Server shutting down');
          }
        });
        let deadline: NodeJS.Timeout | undefined;
        await Promise.race([
          drain,
          new Promise<void>((resolve) => {
            deadline = setTimeout(resolve, 1_000);
          }),
        ]);
        if (deadline) clearTimeout(deadline);
        for (const client of clients) {
          if (client.readyState !== WebSocket.CLOSED) client.terminate();
          removeConnection(client as TrackedSocket);
        }
        await new Promise<void>((resolve) => wss.close(() => resolve()));
      })();
      return closePromise;
    },
  };
}
