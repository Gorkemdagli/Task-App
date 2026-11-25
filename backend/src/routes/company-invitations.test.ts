import { createServer } from 'node:http';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { createApp } from '../app';
import { withUserContext } from '../db/withUser';
import { env } from '../env';
import { notifyCompanyInvitationOutcome } from '../lib/notifications';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { attachRealtimeServer } from '../realtime/server';
import { issueRealtimeTicket } from '../realtime/tickets';
import { register } from '../services/auth.service';

async function cleanDb() {
  await prisma.notification.deleteMany();
  await prisma.companyInvitation.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.task.deleteMany();
  await prisma.team.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const keys = await redis.keys('*');
  if (keys.length) await redis.del(...keys);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function startRealtimeServer(app: ReturnType<typeof createApp>) {
  const server = createServer(app);
  const realtime = attachRealtimeServer(server, { enabled: true, clientUrl: env.CLIENT_URL });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
  return {
    server,
    realtime,
    url: `ws://127.0.0.1:${address.port}/api/v1/realtime/ws`,
  };
}

async function connectRealtime(
  url: string,
  identity: { jti: string; userId: string; tenantId: string },
): Promise<WebSocket> {
  const ticket = await issueRealtimeTicket(identity);
  const socket = new WebSocket(url, ['taskflow.v1', `ticket.${ticket}`], {
    headers: { Origin: env.CLIENT_URL },
  });
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
    socket.once('unexpected-response', (_request, response) =>
      reject(new Error(`realtime upgrade failed: ${response.statusCode}`)),
    );
  });
}

function nextRealtimeMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('realtime event timed out')), 2_000);
    socket.once('message', (data, isBinary) => {
      clearTimeout(timeout);
      if (isBinary) {
        reject(new Error('expected a text event'));
        return;
      }
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });
}

async function stopRealtimeServer(harness: Awaited<ReturnType<typeof startRealtimeServer>>) {
  await harness.realtime.close();
  if (harness.server.listening) {
    await new Promise<void>((resolve, reject) =>
      harness.server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe('company invitation routes', () => {
  beforeEach(cleanDb);
  afterAll(cleanDb);

  it('requires authentication on outgoing and recipient routes', async () => {
    const app = createApp();
    const responses = await Promise.all([
      request(app).post('/api/v1/company/invitations').send({ email: 'target@example.com' }),
      request(app).get('/api/v1/company/invitations?status=pending'),
      request(app).delete('/api/v1/company/invitations/00000000-0000-0000-0000-000000000000'),
      request(app).get('/api/v1/users/me/company-invitations'),
      request(app).post(
        '/api/v1/users/me/company-invitations/00000000-0000-0000-0000-000000000000/accept',
      ),
      request(app).post(
        '/api/v1/users/me/company-invitations/00000000-0000-0000-0000-000000000000/reject',
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401]);
  });

  it('allows only company admins to create invitations', async () => {
    const member = await register({
      fullName: 'Member',
      email: 'member@company.test',
      password: 'hunter22',
    });

    const response = await request(createApp())
      .post('/api/v1/company/invitations')
      .set(auth(member.accessToken))
      .send({ displayId: 'KMU24' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
  });

  it('creates an invitation without changing recipient membership', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'admin@company.test',
      password: 'hunter22',
      companyName: 'Acme',
    });
    const recipient = await register({
      fullName: 'Recipient',
      email: 'recipient@company.test',
      password: 'hunter22',
    });

    const response = await request(createApp())
      .post('/api/v1/company/invitations')
      .set(auth(admin.accessToken))
      .send({ email: ` ${recipient.user.email.toUpperCase()} ` });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      tenantId: admin.user.tenantId,
      recipientUserId: recipient.user.id,
      recipientEmail: recipient.user.email,
      status: 'pending',
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: recipient.user.id } })).tenantId,
    ).toBe(null);
  });

  it('returns the same 404 for missing and foreign target users', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'not-found-admin@company.test',
      password: 'hunter22',
      companyName: 'Acme',
    });
    const foreign = await register({
      fullName: 'Foreign',
      email: 'foreign@company.test',
      password: 'hunter22',
      companyName: 'Other',
    });
    const app = createApp();

    const missing = await request(app)
      .post('/api/v1/company/invitations')
      .set(auth(admin.accessToken))
      .send({ displayId: 'ZZZZZ' });
    const crossTenant = await request(app)
      .post('/api/v1/company/invitations')
      .set(auth(admin.accessToken))
      .send({ displayId: foreign.user.displayId });

    expect(missing.status).toBe(404);
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body).toEqual(missing.body);
    expect(crossTenant.body.error).toBe('USER_NOT_FOUND');
  });

  it('lists only the current tenant invitations and cancels a pending invitation', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'list-admin@company.test',
      password: 'hunter22',
      companyName: 'Acme',
    });
    const recipient = await register({
      fullName: 'Recipient',
      email: 'list-recipient@company.test',
      password: 'hunter22',
    });
    const foreignAdmin = await register({
      fullName: 'Foreign Admin',
      email: 'list-foreign-admin@company.test',
      password: 'hunter22',
      companyName: 'Other',
    });
    const otherRecipient = await register({
      fullName: 'Other Recipient',
      email: 'list-other-recipient@company.test',
      password: 'hunter22',
    });
    const app = createApp();

    const created = await request(app)
      .post('/api/v1/company/invitations')
      .set(auth(admin.accessToken))
      .send({ displayId: recipient.user.displayId });
    const foreignCreated = await request(app)
      .post('/api/v1/company/invitations')
      .set(auth(foreignAdmin.accessToken))
      .send({ displayId: otherRecipient.user.displayId });

    const list = await request(app)
      .get('/api/v1/company/invitations?status=pending')
      .set(auth(admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
    expect(list.body[0].id).not.toBe(foreignCreated.body.id);

    const cancelled = await request(app)
      .delete(`/api/v1/company/invitations/${created.body.id}`)
      .set(auth(admin.accessToken));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ id: created.body.id, status: 'cancelled' });
  });

  it('lists and rejects invitations for tenantless recipients', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'recipient-admin@company.test',
      password: 'hunter22',
      companyName: 'Acme',
    });
    const recipient = await register({
      fullName: 'Recipient',
      email: 'recipient-list@company.test',
      password: 'hunter22',
    });
    const app = createApp();
    const created = await request(app)
      .post('/api/v1/company/invitations')
      .set(auth(admin.accessToken))
      .send({ email: recipient.user.email });

    const list = await request(app)
      .get('/api/v1/users/me/company-invitations')
      .set(auth(recipient.accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toEqual({
      invitations: [expect.objectContaining({ id: created.body.id, status: 'pending' })],
      pendingCount: 1,
    });

    const rejected = await request(app)
      .post(`/api/v1/users/me/company-invitations/${created.body.id}/reject`)
      .set(auth(recipient.accessToken));
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ id: created.body.id, status: 'rejected' });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: recipient.user.id } })).tenantId,
    ).toBe(null);
  });

  it('accepts an invitation and returns the updated authenticated user', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'accept-admin@company.test',
      password: 'hunter22',
      companyName: 'Acme',
    });
    const recipient = await register({
      fullName: 'Recipient',
      email: 'accept-recipient@company.test',
      password: 'hunter22',
    });
    const app = createApp();
    const created = await request(app)
      .post('/api/v1/company/invitations')
      .set(auth(admin.accessToken))
      .send({ displayId: recipient.user.displayId });

    const accepted = await request(app)
      .post(`/api/v1/users/me/company-invitations/${created.body.id}/accept`)
      .set(auth(recipient.accessToken));
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      invitation: { id: created.body.id, status: 'accepted' },
      user: { id: recipient.user.id, tenantId: admin.user.tenantId, role: 'member' },
    });
    expect(await prisma.teamMember.count({ where: { userId: recipient.user.id } })).toBe(0);
  });

  it('notifies every same-tenant company admin of accepted and rejected invitations', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'outcome-admin@company.test',
      password: 'hunter22',
      companyName: 'Acme',
    });
    const coAdmin = await register({
      fullName: 'Co Admin',
      email: 'outcome-coadmin@company.test',
      password: 'hunter22',
    });
    await prisma.user.update({
      where: { id: coAdmin.user.id },
      data: { tenantId: admin.user.tenantId, role: 'companyAdmin' },
    });
    const foreignAdmin = await register({
      fullName: 'Foreign Admin',
      email: 'outcome-foreign-admin@company.test',
      password: 'hunter22',
      companyName: 'Other Co',
    });
    const acceptedRecipient = await register({
      fullName: 'Accepted User',
      email: 'outcome-accepted@company.test',
      password: 'hunter22',
    });
    const rejectedRecipient = await register({
      fullName: 'Rejected User',
      email: 'outcome-rejected@company.test',
      password: 'hunter22',
    });
    const app = createApp();
    const realtime = await startRealtimeServer(app);
    try {
      const adminSocket = await connectRealtime(realtime.url, {
        jti: verifyAccessToken(admin.accessToken).jti,
        userId: admin.user.id,
        tenantId: admin.user.tenantId!,
      });
      const coAdminSocket = await connectRealtime(realtime.url, {
        jti: verifyAccessToken(coAdmin.accessToken).jti,
        userId: coAdmin.user.id,
        tenantId: admin.user.tenantId!,
      });

      const acceptedInvitation = await request(realtime.server)
        .post('/api/v1/company/invitations')
        .set(auth(admin.accessToken))
        .send({ email: acceptedRecipient.user.email });
      const rejectedInvitation = await request(realtime.server)
        .post('/api/v1/company/invitations')
        .set(auth(admin.accessToken))
        .send({ email: rejectedRecipient.user.email });
      expect(acceptedInvitation.status).toBe(201);
      expect(rejectedInvitation.status).toBe(201);

      const acceptedSignals = [nextRealtimeMessage(adminSocket), nextRealtimeMessage(coAdminSocket)];
      const accepted = await request(realtime.server)
        .post(`/api/v1/users/me/company-invitations/${acceptedInvitation.body.id}/accept`)
        .set(auth(acceptedRecipient.accessToken));
      expect(accepted.status).toBe(200);
      for (const event of await Promise.all(acceptedSignals)) {
        expect(event).toMatchObject({ v: 1, type: 'notification.created' });
      }

      const rejectedSignals = [nextRealtimeMessage(adminSocket), nextRealtimeMessage(coAdminSocket)];
      const rejected = await request(realtime.server)
        .post(`/api/v1/users/me/company-invitations/${rejectedInvitation.body.id}/reject`)
        .set(auth(rejectedRecipient.accessToken));
      expect(rejected.status).toBe(200);
      for (const event of await Promise.all(rejectedSignals)) {
        expect(event).toMatchObject({ v: 1, type: 'notification.created' });
      }

      const notifications = await prisma.notification.findMany({
        where: { type: { in: ['company_invite_accepted', 'company_invite_rejected'] } },
      });
      expect(notifications).toHaveLength(4);
      expect(new Set(notifications.map((notification) => notification.userId))).toEqual(
        new Set([admin.user.id, coAdmin.user.id]),
      );
      expect(
        notifications.some((notification) => notification.userId === foreignAdmin.user.id),
      ).toBe(false);
      expect(
        notifications.find((notification) => notification.type === 'company_invite_accepted')
          ?.payload,
      ).toMatchObject({ actorName: acceptedRecipient.user.fullName, companyName: 'Acme' });
      expect(
        notifications.find((notification) => notification.type === 'company_invite_rejected')
          ?.payload,
      ).toMatchObject({ actorName: rejectedRecipient.user.fullName, companyName: 'Acme' });
    } finally {
      await stopRealtimeServer(realtime);
    }
  });

  it('does not publish invitation notifications when the user transaction rolls back', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'rollback-admin@company.test',
      password: 'hunter22',
      companyName: 'Acme',
    });
    const recipient = await register({
      fullName: 'Recipient',
      email: 'rollback-recipient@company.test',
      password: 'hunter22',
    });
    const app = createApp();
    const realtime = await startRealtimeServer(app);
    try {
      const invitationResponse = await request(realtime.server)
        .post('/api/v1/company/invitations')
        .set(auth(admin.accessToken))
        .send({ email: recipient.user.email });
      expect(invitationResponse.status).toBe(201);
      const invitation = await prisma.companyInvitation.findUniqueOrThrow({
        where: { id: invitationResponse.body.id },
      });
      const socket = await connectRealtime(realtime.url, {
        jti: verifyAccessToken(admin.accessToken).jti,
        userId: admin.user.id,
        tenantId: admin.user.tenantId!,
      });
      const messages: string[] = [];
      socket.on('message', (data) => messages.push(data.toString()));

      await expect(
        withUserContext(recipient.user.id, async (db) => {
          await notifyCompanyInvitationOutcome(
            db,
            { id: invitation.id, tenantId: invitation.tenantId, companyName: invitation.companyName },
            'rejected',
            recipient.user.fullName,
          );
          throw new Error('rollback after notification');
        }),
      ).rejects.toThrow('rollback after notification');

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(messages).toEqual([]);
      expect(await prisma.companyInvitation.findUniqueOrThrow({ where: { id: invitation.id } }))
        .toMatchObject({ status: 'pending' });
      expect(await prisma.notification.count({ where: { userId: admin.user.id } })).toBe(0);
    } finally {
      await stopRealtimeServer(realtime);
    }
  });

  it('returns 410 and expires a stale invitation before responding', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'expired-admin@company.test',
      password: 'hunter22',
      companyName: 'Acme',
    });
    const recipient = await register({
      fullName: 'Recipient',
      email: 'expired-recipient@company.test',
      password: 'hunter22',
    });
    const app = createApp();
    const created = await prisma.companyInvitation.create({
      data: {
        tenantId: admin.user.tenantId!,
        recipientUserId: recipient.user.id,
        invitedByUserId: admin.user.id,
        companyName: 'Acme',
        inviterName: 'Admin',
        status: 'pending',
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    });

    const response = await request(app)
      .post(`/api/v1/users/me/company-invitations/${created.id}/accept`)
      .set(auth(recipient.accessToken));
    expect(response.status).toBe(410);
    expect(response.body.error).toBe('INVITATION_EXPIRED');
    expect(
      (await prisma.companyInvitation.findUniqueOrThrow({ where: { id: created.id } })).status,
    ).toBe('expired');
  });

  it('does not expose the removed direct company-user claim route', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'removed-direct-admin@company.test',
      password: 'hunter22',
      companyName: 'Acme',
    });
    const response = await request(createApp())
      .post('/api/v1/company/users')
      .set(auth(admin.accessToken))
      .send({ displayId: 'KMU24' });

    expect(response.status).toBe(404);
  });
});
