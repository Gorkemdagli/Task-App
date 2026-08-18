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
});
