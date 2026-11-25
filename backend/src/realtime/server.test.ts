import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../app';
import { afterTransactionCommit } from '../db/afterCommit';
import { withTenantContext } from '../db/withTenant';
import { env } from '../env';
import { notifyUser } from '../lib/notifications';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { revokeAllUserSessions } from '../lib/sessionStore';
import { verifyAccessToken } from '../lib/jwt';
import { register } from '../services/auth.service';
import { attachRealtimeServer } from './server';
import { issueRealtimeTicket } from './tickets';
import '../test/setup';

type TestIdentity = {
  jti: string;
  userId: string;
  tenantId: string;
};

type Attempt = { status: number; socket?: WebSocket };

describe('realtime websocket upgrade', () => {
  let server: Server | undefined;
  let realtime: ReturnType<typeof attachRealtimeServer> | undefined;
  const users: Array<{ id: string; tenantId: string }> = [];

  async function startServer(heartbeatIntervalMs = 30_000, enabled = true): Promise<string> {
    server = createServer(createApp(false));
    realtime = attachRealtimeServer(server, {
      enabled,
      clientUrl: env.CLIENT_URL,
      heartbeatIntervalMs,
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
    return `ws://127.0.0.1:${address.port}/api/v1/realtime/ws`;
  }

  async function createIdentity(): Promise<TestIdentity> {
    const unique = randomUUID();
    const registered = await register({
      fullName: 'Realtime Test',
      email: `realtime-${unique}@example.test`,
      password: 'realtime-test-pass',
      companyName: `Realtime Test ${unique}`,
    });
    const tenantId = registered.user.tenantId;
    if (!tenantId) throw new Error('Expected a tenant for realtime test user');
    users.push({ id: registered.user.id, tenantId });
    return { jti: verifyAccessToken(registered.accessToken).jti, userId: registered.user.id, tenantId };
  }

  async function connect(
    url: string,
    protocols: string[],
    origin?: string,
  ): Promise<Attempt> {
    const client = new WebSocket(url, protocols, {
      ...(origin ? { headers: { Origin: origin } } : {}),
    });
    return new Promise((resolve) => {
      let settled = false;
      const finish = (attempt: Attempt) => {
        if (settled) return;
        settled = true;
        resolve(attempt);
      };
      client.once('open', () => finish({ status: 101, socket: client }));
      client.once('unexpected-response', (_request, response) =>
        finish({ status: response.statusCode ?? 0, socket: client }),
      );
      client.once('error', () => finish({ status: 0, socket: client }));
    });
  }

  async function stopServer(): Promise<void> {
    await realtime?.close();
    realtime = undefined;
    if (server?.listening) {
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve())),
      );
    }
    server = undefined;
  }

  async function closeSocket(socket?: WebSocket): Promise<void> {
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    if (socket.readyState !== WebSocket.OPEN) {
      socket.terminate();
      return;
    }
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
  }

  function trackMessages(socket: WebSocket): string[] {
    const messages: string[] = [];
    socket.on('message', (data) => messages.push(data.toString()));
    return messages;
  }

  function nextMessage(socket: WebSocket): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('websocket event timed out')), 2_000);
      socket.once('message', (data) => {
        clearTimeout(timeout);
        resolve(data.toString());
      });
    });
  }

  async function waitForSocketClose(socket: WebSocket): Promise<void> {
    if (socket.readyState === WebSocket.CLOSED) return;
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        new Promise<void>((resolve) => socket.once('close', () => resolve())),
        new Promise<void>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('websocket did not close')), 2_000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  afterEach(async () => {
    await stopServer();
    vi.restoreAllMocks();
    const tenantIds = [...new Set(users.map((user) => user.tenantId))];
    for (const user of users.splice(0)) {
      await revokeAllUserSessions(user.id);
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
    if (tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    const tickets = await redis.keys('realtime-ticket:*');
    if (tickets.length) await redis.del(...tickets);
  });

  it('accepts a valid ticket and selects only taskflow.v1', async () => {
    const url = await startServer();
    const identity = await createIdentity();
    const ticket = await issueRealtimeTicket(identity);

    const attempt = await connect(url, ['taskflow.v1', `ticket.${ticket}`], env.CLIENT_URL);

    expect(attempt.status).toBe(101);
    expect(attempt.socket?.protocol).toBe('taskflow.v1');
    expect(realtime?.connectionsFor(identity.tenantId, identity.userId)).toHaveLength(1);
    await closeSocket(attempt.socket);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(realtime?.connectionsFor(identity.tenantId, identity.userId)).toHaveLength(0);
  });

  it('fans out only committed notifications to every recipient tab', async () => {
    const url = await startServer();
    const recipient = await createIdentity();
    const sameTenantUser = await createIdentity();
    await prisma.user.update({
      where: { id: sameTenantUser.userId },
      data: { tenantId: recipient.tenantId },
    });
    const sameTenantIdentity = { ...sameTenantUser, tenantId: recipient.tenantId };
    const otherTenant = await createIdentity();

    const recipientTabs = await Promise.all(
      [recipient, recipient].map(async (identity) => {
        const ticket = await issueRealtimeTicket(identity);
        return connect(url, ['taskflow.v1', `ticket.${ticket}`], env.CLIENT_URL);
      }),
    );
    const sameTenantTicket = await issueRealtimeTicket(sameTenantIdentity);
    const sameTenantSocket = await connect(
      url,
      ['taskflow.v1', `ticket.${sameTenantTicket}`],
      env.CLIENT_URL,
    );
    const otherTenantTicket = await issueRealtimeTicket(otherTenant);
    const otherTenantSocket = await connect(
      url,
      ['taskflow.v1', `ticket.${otherTenantTicket}`],
      env.CLIENT_URL,
    );
    expect(recipientTabs.map(({ status }) => status)).toEqual([101, 101]);
    expect(sameTenantSocket.status).toBe(101);
    expect(otherTenantSocket.status).toBe(101);

    const messages = [
      trackMessages(recipientTabs[0].socket!),
      trackMessages(recipientTabs[1].socket!),
      trackMessages(sameTenantSocket.socket!),
      trackMessages(otherTenantSocket.socket!),
    ];
    const recipientServerSocket = realtime!.connectionsFor(recipient.tenantId, recipient.userId)[0];
    vi.spyOn(recipientServerSocket, 'send').mockImplementation(() => {
      throw new Error('simulated websocket send failure');
    });
    const delivered = nextMessage(recipientTabs[1].socket!);

    await withTenantContext(recipient.userId, recipient.tenantId, (db) =>
      notifyUser(db, recipient.userId, 'company_invite_accepted', { companyName: 'Private' }),
    );

    const event = JSON.parse(await delivered) as Record<string, unknown>;
    expect(event).toEqual({
      v: 1,
      type: 'notification.created',
      eventId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      occurredAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
    });
    expect(event).not.toHaveProperty('userId');
    expect(event).not.toHaveProperty('tenantId');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(messages.map((tabMessages) => tabMessages.length)).toEqual([0, 1, 0, 0]);
    expect(
      await prisma.notification.count({ where: { userId: recipient.userId } }),
    ).toBe(1);
  });

  it('does not publish notifications from rolled-back or suppressed writes', async () => {
    const url = await startServer();
    const identity = await createIdentity();
    const ticket = await issueRealtimeTicket(identity);
    const attempt = await connect(url, ['taskflow.v1', `ticket.${ticket}`], env.CLIENT_URL);
    expect(attempt.status).toBe(101);
    const messages = trackMessages(attempt.socket!);

    await expect(
      withTenantContext(identity.userId, identity.tenantId, async (db) => {
        await notifyUser(db, identity.userId, 'company_invite_accepted', {});
        throw new Error('rollback notification');
      }),
    ).rejects.toThrow('rollback notification');
    await withTenantContext(identity.userId, identity.tenantId, (db) =>
      notifyUser(db, identity.userId, 'task_assigned', {}),
    );

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(messages).toEqual([]);
    expect(await prisma.notification.count({ where: { userId: identity.userId } })).toBe(0);
  });

  it('keeps nested callbacks bound to their exact Prisma transaction', async () => {
    const url = await startServer();
    const identity = await createIdentity();
    const ticket = await issueRealtimeTicket(identity);
    const attempt = await connect(url, ['taskflow.v1', `ticket.${ticket}`], env.CLIENT_URL);
    expect(attempt.status).toBe(101);
    const messages = trackMessages(attempt.socket!);
    let releaseOuter!: () => void;
    let markNestedWriteComplete!: () => void;
    let markOuterCallbackComplete!: () => void;
    const nestedWriteComplete = new Promise<void>((resolve) => {
      markNestedWriteComplete = resolve;
    });
    const outerCallbackComplete = new Promise<void>((resolve) => {
      markOuterCallbackComplete = resolve;
    });
    const outerCallback = vi.fn(markOuterCallbackComplete);
    const delivered = nextMessage(attempt.socket!);

    const outerTransaction = withTenantContext(identity.userId, identity.tenantId, async (outerDb) => {
      afterTransactionCommit(outerDb, outerCallback);
      await withTenantContext(identity.userId, identity.tenantId, (db) =>
        notifyUser(db, identity.userId, 'company_invite_accepted', {}),
      );
      markNestedWriteComplete();
      await new Promise<void>((resolve) => {
        releaseOuter = resolve;
      });
    });
    await nestedWriteComplete;
    expect(JSON.parse(await delivered)).toMatchObject({ v: 1, type: 'notification.created' });
    expect(outerCallback).not.toHaveBeenCalled();
    expect(messages).toHaveLength(1);
    releaseOuter();
    await outerTransaction;
    await outerCallbackComplete;

    expect(outerCallback).toHaveBeenCalledTimes(1);
    expect(await prisma.notification.count({ where: { userId: identity.userId } })).toBe(1);
  });

  it('closes revoked recipient sessions without publishing to them', async () => {
    const url = await startServer();
    const recipient = await createIdentity();
    const sender = await createIdentity();
    await prisma.user.update({ where: { id: sender.userId }, data: { tenantId: recipient.tenantId } });
    const senderIdentity = { ...sender, tenantId: recipient.tenantId };
    const ticket = await issueRealtimeTicket(recipient);
    const attempt = await connect(url, ['taskflow.v1', `ticket.${ticket}`], env.CLIENT_URL);
    expect(attempt.status).toBe(101);
    const messages = trackMessages(attempt.socket!);
    const closed = waitForSocketClose(attempt.socket!);

    await revokeAllUserSessions(recipient.userId);
    await withTenantContext(senderIdentity.userId, senderIdentity.tenantId, (db) =>
      notifyUser(db, recipient.userId, 'company_invite_accepted', {}),
    );

    await closed;
    expect(messages).toEqual([]);
    expect(await prisma.notification.count({ where: { userId: recipient.userId } })).toBe(1);
  });

  it('returns 404 for a websocket upgrade while realtime is disabled', async () => {
    const url = await startServer(30_000, false);

    expect((await connect(url, ['taskflow.v1'], env.CLIENT_URL)).status).toBe(404);
  });

  it('persists notifications while realtime delivery is disabled', async () => {
    await startServer(30_000, false);
    const identity = await createIdentity();

    await withTenantContext(identity.userId, identity.tenantId, (db) =>
      notifyUser(db, identity.userId, 'company_invite_accepted', {}),
    );

    expect(await prisma.notification.count({ where: { userId: identity.userId } })).toBe(1);
  });

  it('rejects missing and wrong origins with 403', async () => {
    const url = await startServer();
    const identity = await createIdentity();
    const ticket = await issueRealtimeTicket(identity);
    const protocols = ['taskflow.v1', `ticket.${ticket}`];

    expect((await connect(url, protocols)).status).toBe(403);
    expect((await connect(url, protocols, 'https://attacker.example')).status).toBe(403);
  });

  it('rejects missing, invalid, expired and already consumed tickets', async () => {
    const url = await startServer();
    expect((await connect(url, ['taskflow.v1'], env.CLIENT_URL)).status).toBe(401);
    expect((await connect(url, ['taskflow.v1', 'ticket.invalid'], env.CLIENT_URL)).status).toBe(401);

    const identity = await createIdentity();
    const expired = await issueRealtimeTicket(identity);
    const expiredKey = `realtime-ticket:${createHash('sha256').update(expired).digest('hex')}`;
    await redis.pexpire(expiredKey, 0);
    expect((await connect(url, ['taskflow.v1', `ticket.${expired}`], env.CLIENT_URL)).status).toBe(
      401,
    );

    const replayed = await issueRealtimeTicket(identity);
    const first = await connect(url, ['taskflow.v1', `ticket.${replayed}`], env.CLIENT_URL);
    expect(first.status).toBe(101);
    await closeSocket(first.socket);
    expect((await connect(url, ['taskflow.v1', `ticket.${replayed}`], env.CLIENT_URL)).status).toBe(
      401,
    );
  });

  it('allows exactly one concurrent upgrade for the same ticket', async () => {
    const url = await startServer();
    const identity = await createIdentity();
    const ticket = await issueRealtimeTicket(identity);
    const protocols = ['taskflow.v1', `ticket.${ticket}`];

    const attempts = await Promise.all([
      connect(url, protocols, env.CLIENT_URL),
      connect(url, protocols, env.CLIENT_URL),
    ]);

    expect(attempts.map(({ status }) => status).sort()).toEqual([101, 401]);
    await Promise.all(attempts.map(({ socket }) => closeSocket(socket)));
  });

  it('rejects client commands and bounds websocket payloads', async () => {
    const url = await startServer();
    const identity = await createIdentity();
    const commandTicket = await issueRealtimeTicket(identity);
    const command = await connect(
      url,
      ['taskflow.v1', `ticket.${commandTicket}`],
      env.CLIENT_URL,
    );
    expect(command.status).toBe(101);
    const commandClosed = new Promise<number>((resolve) =>
      command.socket!.once('close', (code) => resolve(code)),
    );
    command.socket!.send('subscribe');
    expect(await commandClosed).toBe(1008);

    const payloadTicket = await issueRealtimeTicket(identity);
    const payload = await connect(
      url,
      ['taskflow.v1', `ticket.${payloadTicket}`],
      env.CLIENT_URL,
    );
    expect(payload.status).toBe(101);
    const payloadClosed = new Promise<number>((resolve) =>
      payload.socket!.once('close', (code) => resolve(code)),
    );
    payload.socket!.send(Buffer.alloc(1025));
    expect(await payloadClosed).toBe(1009);
  });

  it('denies revoked, deactivated and identity-drifted sessions', async () => {
    const url = await startServer();
    const revoked = await createIdentity();
    const revokedTicket = await issueRealtimeTicket(revoked);
    await redis.del(`access-session:${revoked.jti}`);
    expect(
      (
        await connect(
          url,
          ['taskflow.v1', `ticket.${revokedTicket}`],
          env.CLIENT_URL,
        )
      ).status,
    ).toBe(401);

    const deactivated = await createIdentity();
    const deactivatedTicket = await issueRealtimeTicket(deactivated);
    await prisma.user.update({ where: { id: deactivated.userId }, data: { deletedAt: new Date() } });
    expect(
      (
        await connect(
          url,
          ['taskflow.v1', `ticket.${deactivatedTicket}`],
          env.CLIENT_URL,
        )
      ).status,
    ).toBe(401);

    const changed = await createIdentity();
    const other = await createIdentity();
    const changedTicket = await issueRealtimeTicket(changed);
    await prisma.user.update({ where: { id: changed.userId }, data: { tenantId: other.tenantId } });
    expect(
      (
        await connect(
          url,
          ['taskflow.v1', `ticket.${changedTicket}`],
          env.CLIENT_URL,
        )
      ).status,
    ).toBe(401);
  });

  it('fails closed on Redis outage and revalidates sessions during heartbeat', async () => {
    const url = await startServer(100);
    const identity = await createIdentity();
    const ticket = await issueRealtimeTicket(identity);
    vi.spyOn(redis, 'eval').mockRejectedValue(new Error('Redis unavailable'));
    expect(
      (await connect(url, ['taskflow.v1', `ticket.${ticket}`], env.CLIENT_URL)).status,
    ).toBe(503);
    vi.restoreAllMocks();

    const heartbeatTicket = await issueRealtimeTicket(identity);
    const attempt = await connect(
      url,
      ['taskflow.v1', `ticket.${heartbeatTicket}`],
      env.CLIENT_URL,
    );
    expect(attempt.status).toBe(101);
    const closed = new Promise<void>((resolve) => attempt.socket!.once('close', () => resolve()));
    await redis.del(`access-session:${identity.jti}`);
    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([
      closed,
      new Promise<void>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('heartbeat did not close socket')), 2_000);
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
    expect(attempt.socket?.readyState).toBe(WebSocket.CLOSED);
  });

  it('closes open connections during server shutdown', async () => {
    const url = await startServer();
    const identity = await createIdentity();
    const ticket = await issueRealtimeTicket(identity);
    const attempt = await connect(url, ['taskflow.v1', `ticket.${ticket}`], env.CLIENT_URL);
    expect(attempt.status).toBe(101);
    const closed = new Promise<void>((resolve) => attempt.socket!.once('close', () => resolve()));

    await realtime!.close();
    await closed;

    expect(attempt.socket?.readyState).toBe(WebSocket.CLOSED);
  });

  it('rejects an in-flight upgrade when shutdown starts', async () => {
    const url = await startServer();
    const identity = await createIdentity();
    const ticket = await issueRealtimeTicket(identity);
    let markEvalStarted!: () => void;
    let resolveEval!: (value: string) => void;
    const evalStarted = new Promise<void>((resolve) => {
      markEvalStarted = resolve;
    });
    vi.spyOn(redis, 'eval').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEval = resolve;
          markEvalStarted();
        }) as never,
    );

    const pendingAttempt = connect(url, ['taskflow.v1', `ticket.${ticket}`], env.CLIENT_URL);
    await evalStarted;
    await realtime!.close();
    const attempt = await pendingAttempt;
    resolveEval(JSON.stringify(identity));

    expect(attempt.status).toBe(503);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(realtime?.connectionsFor(identity.tenantId, identity.userId)).toHaveLength(0);
  });
});
