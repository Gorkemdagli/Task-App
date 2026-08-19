import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { signAccessToken, signRefreshToken } from '../src/lib/jwt';
import { registerIssuedTokens } from '../src/lib/sessionStore';
import { redis } from '../src/lib/redis';

export interface PerformanceFixture {
  tenantId: string;
  teamId: string;
  taskId: string;
  userId: string;
  accessToken: string;
}

export async function createPerformanceFixture(input: {
  slug: string;
  email: string;
  password: string;
  replaceExisting?: boolean;
}): Promise<PerformanceFixture> {
  if (input.replaceExisting) {
    await prisma.tenant.deleteMany({ where: { slug: input.slug } });
  }

  const tenant = await prisma.tenant.create({
    data: { name: `Performance ${input.slug}`, slug: input.slug, nameKey: input.slug },
  });
  const user = await prisma.user.create({
    data: {
      email: input.email,
      fullName: 'Performance Admin',
      passwordHash: await hashPassword(input.password),
      displayId: `PERF${randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase()}`,
      role: 'companyAdmin',
      tenantId: tenant.id,
    },
  });
  const team = await prisma.team.create({
    data: { tenantId: tenant.id, name: 'Performance Team' },
  });
  await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id, role: 'member' } });
  const task = await prisma.task.create({
    data: {
      teamId: team.id,
      title: 'Performance Task',
      priority: 'medium',
      assignerId: user.id,
      assignees: { create: { userId: user.id } },
    },
  });

  const accessToken = signAccessToken(user.id, tenant.id);
  const refreshToken = signRefreshToken(user.id, tenant.id);
  await registerIssuedTokens(accessToken, refreshToken, user.id);

  return {
    tenantId: tenant.id,
    teamId: team.id,
    taskId: task.id,
    userId: user.id,
    accessToken,
  };
}

export async function deletePerformanceFixture(tenantId: string): Promise<void> {
  await prisma.tenant.delete({ where: { id: tenantId } });
}

export async function closePerformanceFixtureResources(): Promise<void> {
  try {
    await prisma.$disconnect();
  } finally {
    await redis.quit();
  }
}

if (process.argv[1]?.endsWith('performance-fixture.ts')) {
  const run = async () => {
    try {
      const email = process.env.PERF_EMAIL;
      const password = process.env.PERF_PASSWORD;
      if (!email || !password) throw new Error('PERF_EMAIL and PERF_PASSWORD are required');
      const fixture = await createPerformanceFixture({
        slug: 'perf-lighthouse',
        email,
        password,
        replaceExisting: true,
      });
      console.log(
        JSON.stringify({
          tenantId: fixture.tenantId,
          teamId: fixture.teamId,
          taskId: fixture.taskId,
        }),
      );
    } finally {
      await closePerformanceFixtureResources();
    }
  };
  void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
