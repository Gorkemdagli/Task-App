import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register } from '../services/auth.service';

async function cleanDb() {
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

describe('company settings routes', () => {
  beforeEach(cleanDb);

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

  it('directly adds tenantless user as member without team membership', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'add-admin@company.test',
      password: 'hunter22',
      companyName: 'Add Company',
    });
    const target = await register({
      fullName: 'Target',
      email: 'add-target@company.test',
      password: 'hunter22',
    });

    const response = await request(createApp())
      .post('/api/v1/company/users')
      .set(auth(admin.accessToken))
      .send({ displayId: target.user.displayId });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: target.user.id,
      displayId: target.user.displayId,
      role: 'member',
      teamRoles: [],
    });
    await expect(prisma.user.findUnique({ where: { id: target.user.id } })).resolves.toMatchObject({
      tenantId: admin.user.tenantId,
      role: 'member',
    });
    expect(await prisma.teamMember.count({ where: { userId: target.user.id } })).toBe(0);
  });

  it('returns same 404 body for missing and foreign display IDs', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'not-found-admin@company.test',
      password: 'hunter22',
      companyName: 'Not Found Company',
    });
    const foreign = await register({
      fullName: 'Foreign',
      email: 'foreign@company.test',
      password: 'hunter22',
      companyName: 'Foreign Company',
    });

    const missing = await request(createApp())
      .post('/api/v1/company/users')
      .set(auth(admin.accessToken))
      .send({ displayId: 'ZZZZZ' });
    const crossTenant = await request(createApp())
      .post('/api/v1/company/users')
      .set(auth(admin.accessToken))
      .send({ displayId: foreign.user.displayId });

    expect(missing.status).toBe(404);
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body).toEqual(missing.body);
  });

  it('returns same-tenant conflict and rejects extra fields', async () => {
    const admin = await register({
      fullName: 'Admin',
      email: 'duplicate-admin@company.test',
      password: 'hunter22',
      companyName: 'Duplicate Company',
    });
    const target = await register({
      fullName: 'Target',
      email: 'duplicate-target@company.test',
      password: 'hunter22',
    });
    await prisma.user.update({
      where: { id: target.user.id },
      data: { tenantId: admin.user.tenantId, role: 'member' },
    });

    const conflict = await request(createApp())
      .post('/api/v1/company/users')
      .set(auth(admin.accessToken))
      .send({ displayId: target.user.displayId });
    const invalid = await request(createApp())
      .post('/api/v1/company/users')
      .set(auth(admin.accessToken))
      .send({ displayId: target.user.displayId, role: 'companyAdmin' });

    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('USER_ALREADY_IN_COMPANY');
    expect(invalid.status).toBe(400);
  });

  it('allows exactly one tenant to claim a user during concurrent requests', async () => {
    const adminA = await register({
      fullName: 'Admin A',
      email: 'race-a@company.test',
      password: 'hunter22',
      companyName: 'Race A',
    });
    const adminB = await register({
      fullName: 'Admin B',
      email: 'race-b@company.test',
      password: 'hunter22',
      companyName: 'Race B',
    });
    const target = await register({
      fullName: 'Race Target',
      email: 'race-target@company.test',
      password: 'hunter22',
    });
    const app = createApp();

    const [claimA, claimB] = await Promise.all([
      request(app)
        .post('/api/v1/company/users')
        .set(auth(adminA.accessToken))
        .send({ displayId: target.user.displayId }),
      request(app)
        .post('/api/v1/company/users')
        .set(auth(adminB.accessToken))
        .send({ displayId: target.user.displayId }),
    ]);
    const statuses = [claimA.status, claimB.status].sort((a, b) => a - b);
    const updated = await prisma.user.findUnique({ where: { id: target.user.id } });

    expect(statuses).toEqual([201, 404]);
    expect([adminA.user.tenantId, adminB.user.tenantId]).toContain(updated?.tenantId);
    expect(updated?.role).toBe('member');
    expect(await prisma.teamMember.count({ where: { userId: target.user.id } })).toBe(0);
  });
});
