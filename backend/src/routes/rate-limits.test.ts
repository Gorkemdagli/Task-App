import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

async function cleanDb() {
  await prisma.taskComment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const keys = await redis.keys('*');
  if (keys.length) await redis.del(...keys);
}

async function registerTestUser(email = 'rate-limits@example.com') {
  const response = await request(createApp())
    .post('/api/v1/auth/register')
    .send({ fullName: 'Rate Limit User', email, password: 'hunter22', companyName: 'Rate Co' });

  return { token: response.body.accessToken as string };
}

describe('R3 route rate-limit profiles', () => {
  beforeEach(cleanDb);

  it('uses the shared authenticated read bucket across protected GET routes', async () => {
    const { token } = await registerTestUser();
    const app = createApp();

    for (let i = 0; i < 120; i++) {
      expect(
        (await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`)).status,
      ).toBe(200);
    }

    expect(
      (await request(app).get('/api/v1/teams').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(429);
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });

  it('uses the shared write bucket across protected mutation routes', async () => {
    const { token } = await registerTestUser('write-rate-limits@example.com');
    const app = createApp();

    for (let i = 0; i < 30; i++) {
      expect(
        (await request(app).post('/api/v1/tasks').set('Authorization', `Bearer ${token}`).send({}))
          .status,
      ).toBe(400);
    }

    expect(
      (await request(app).post('/api/v1/teams').set('Authorization', `Bearer ${token}`).send({}))
        .status,
    ).toBe(429);
  });

  it('uses normalized IP keys for public auth profiles', async () => {
    await request(createApp()).post('/api/v1/auth/register').send({});

    expect((await redis.keys('rl:register:ip:*')).length).toBeGreaterThan(0);
  });
});
