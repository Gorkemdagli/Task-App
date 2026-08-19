import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register } from '../services/auth.service';

const media = vi.hoisted(() => ({
  storage: {
    uploadLogo: vi.fn(),
    deletePath: vi.fn().mockResolvedValue(undefined),
  },
  deleteOwnedLogo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/mediaStorage', () => ({
  createMediaStorage: () => media.storage,
  deleteOwnedLogo: media.deleteOwnedLogo,
}));

async function cleanDb() {
  await prisma.taskComment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.task.deleteMany();
  await prisma.team.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.companyInvitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const keys = await redis.keys('*');
  if (keys.length) await redis.del(...keys);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('company settings routes', () => {
  beforeEach(async () => {
    await cleanDb();
    media.storage.uploadLogo.mockReset();
    media.storage.deletePath.mockReset().mockResolvedValue(undefined);
    media.deleteOwnedLogo.mockReset().mockResolvedValue(undefined);
  });

  it('requires authentication', async () => {
    const response = await request(createApp()).get('/api/v1/company/settings');

    expect(response.status).toBe(401);
  });

  it('blocks members', async () => {
    const registered = await register({
      fullName: 'Member',
      email: 'member@company.test',
      password: 'hunter22',
    });

    const response = await request(createApp())
      .get('/api/v1/company/settings')
      .set(auth(registered.accessToken));

    expect(response.status).toBe(403);
  });

  it('returns and updates current tenant settings with stable slug', async () => {
    const registered = await register({
      fullName: 'Admin',
      email: 'admin@company.test',
      password: 'hunter22',
      companyName: 'Acme Corp',
    });
    const app = createApp();

    const read = await request(app)
      .get('/api/v1/company/settings')
      .set(auth(registered.accessToken));
    expect(read.status).toBe(200);
    expect(read.body).toEqual({
      id: registered.user.tenantId,
      name: 'Acme Corp',
      slug: 'acme-corp',
      description: null,
      logoUrl: null,
    });

    const update = await request(app)
      .patch('/api/v1/company/settings')
      .set(auth(registered.accessToken))
      .send({ name: '  New  Company ', description: '  Updated  ' });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({
      name: 'New  Company',
      slug: 'acme-corp',
      description: 'Updated',
    });
  });

  it('rejects empty, unknown, and slug mutations', async () => {
    const registered = await register({
      fullName: 'Admin',
      email: 'validation@company.test',
      password: 'hunter22',
      companyName: 'Validation Co',
    });
    const app = createApp();

    for (const body of [{}, { slug: 'changed' }]) {
      const response = await request(app)
        .patch('/api/v1/company/settings')
        .set(auth(registered.accessToken))
        .send(body);
      expect(response.status).toBe(400);
    }
  });

  it('rejects normalized company-name conflicts', async () => {
    const first = await register({
      fullName: 'First',
      email: 'first@company.test',
      password: 'hunter22',
      companyName: 'Acme Corp',
    });
    const second = await register({
      fullName: 'Second',
      email: 'second@company.test',
      password: 'hunter22',
      companyName: 'Second Corp',
    });

    const response = await request(createApp())
      .patch('/api/v1/company/settings')
      .set(auth(second.accessToken))
      .send({ name: ' acme   corp ' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('COMPANY_NAME_ALREADY_IN_USE');
    expect(first.user.tenantId).not.toBe(second.user.tenantId);
  });

  it('creates, lists, and cancels a pending invitation without changing membership', async () => {
    const admin = await register({
      fullName: 'Invitation Admin',
      email: 'invitation-settings-admin@company.test',
      password: 'hunter22',
      companyName: 'Invitation Settings Company',
    });
    const target = await register({
      fullName: 'Invitation Target',
      email: 'invitation-settings-target@company.test',
      password: 'hunter22',
    });
    const app = createApp();

    const created = await request(app)
      .post('/api/v1/company/invitations')
      .set(auth(admin.accessToken))
      .send({ email: target.user.email.toUpperCase() });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      tenantId: admin.user.tenantId,
      recipientEmail: target.user.email,
      status: 'pending',
    });
    await expect(prisma.user.findUnique({ where: { id: target.user.id } })).resolves.toMatchObject({
      tenantId: null,
    });

    const list = await request(app)
      .get('/api/v1/company/invitations?status=pending')
      .set(auth(admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const cancelled = await request(app)
      .delete(`/api/v1/company/invitations/${created.body.id}`)
      .set(auth(admin.accessToken));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ id: created.body.id, status: 'cancelled' });
  });

  it('uploads logo before tenant update and cleans previous owned logo', async () => {
    const admin = await register({
      fullName: 'Logo Admin',
      email: 'logo-admin@company.test',
      password: 'hunter22',
      companyName: 'Logo Company',
    });
    const previousUrl = `https://storage.test/storage/v1/object/public/taskflow-media/logos/${admin.user.tenantId}/old.webp`;
    await prisma.tenant.update({
      where: { id: admin.user.tenantId! },
      data: { logoUrl: previousUrl },
    });
    media.storage.uploadLogo.mockResolvedValue({
      path: `logos/${admin.user.tenantId}/new.webp`,
      url: `https://storage.test/storage/v1/object/public/taskflow-media/logos/${admin.user.tenantId}/new.webp`,
    });
    const image = await sharp({
      create: { width: 80, height: 40, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer();

    const response = await request(createApp())
      .post('/api/v1/company/settings/logo')
      .set(auth(admin.accessToken))
      .attach('logo', image, { filename: 'logo.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.logoUrl).toContain('/logos/');
    expect(media.storage.uploadLogo).toHaveBeenCalledWith(admin.user.tenantId, expect.any(Buffer));
    expect(media.deleteOwnedLogo).toHaveBeenCalledWith(
      media.storage,
      previousUrl,
      admin.user.tenantId,
    );
  });

  it('removes uploaded logo when tenant update fails', async () => {
    const admin = await register({
      fullName: 'Logo Rollback',
      email: 'logo-rollback@company.test',
      password: 'hunter22',
      companyName: 'Logo Rollback Company',
    });
    media.storage.uploadLogo.mockImplementation(async () => {
      await prisma.tenant.delete({ where: { id: admin.user.tenantId! } });
      return {
        path: `logos/${admin.user.tenantId}/orphan.webp`,
        url: `https://storage.test/logos/${admin.user.tenantId}/orphan.webp`,
      };
    });
    const image = await sharp({
      create: { width: 40, height: 40, channels: 3, background: 'green' },
    })
      .png()
      .toBuffer();

    const response = await request(createApp())
      .post('/api/v1/company/settings/logo')
      .set(auth(admin.accessToken))
      .attach('logo', image, { filename: 'logo.png', contentType: 'image/png' });

    expect(response.status).toBe(404);
    expect(media.storage.deletePath).toHaveBeenCalledWith(
      `logos/${admin.user.tenantId}/orphan.webp`,
    );
  });
});
