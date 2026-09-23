import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { signAccessToken, signRefreshToken } from '../src/lib/jwt';
import { registerIssuedTokens, revokeAllUserSessions } from '../src/lib/sessionStore';
import { redis } from '../src/lib/redis';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PerformanceFixture {
  tenantId: string;
  teamId: string;
  taskId: string;
  taskIds: string[];
  userId: string;
  userIds: string[];
  accessToken: string;
  accessTokens: string[];
  taskCount: number;
  eventCount: number;
}

type FixtureInput = {
  slug: string;
  email: string;
  password: string;
  replaceExisting?: boolean;
  taskCount?: number;
  eventsPerTask?: number;
  sessionCount?: number;
};

type FixtureCleanup = Pick<PerformanceFixture, 'tenantId' | 'userIds'>;

type TaskStatus = 'todo' | 'in_progress' | 'done';
type PerformanceEvent = {
  id: string;
  taskId: string;
  actorId: string;
  eventType: 'status_changed' | 'task_reopened';
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  metadata: Record<string, never>;
  createdAt: Date;
};

function buildTaskEvents(
  taskId: string,
  actorId: string,
  createdAt: Date,
  count: number,
): PerformanceEvent[] {
  let status: TaskStatus = 'todo';
  return Array.from({ length: count }, (_, eventIndex) => {
    const fromStatus = status;
    const toStatus: TaskStatus = status === 'in_progress' ? 'done' : 'in_progress';
    const eventType: PerformanceEvent['eventType'] =
      status === 'done' ? 'task_reopened' : 'status_changed';
    status = toStatus;
    return {
      id: randomUUID(),
      taskId,
      actorId,
      eventType,
      fromStatus,
      toStatus,
      metadata: {},
      createdAt: new Date(createdAt.getTime() + (eventIndex + 1) * 60 * 60 * 1000),
    };
  });
}

export async function createPerformanceFixture(input: FixtureInput): Promise<PerformanceFixture> {
  const taskCount = input.taskCount ?? 1;
  const eventsPerTask = input.eventsPerTask ?? 5;
  const sessionCount = input.sessionCount ?? 2;
  if (!Number.isInteger(taskCount) || taskCount < 1) {
    throw new Error('taskCount must be a positive integer');
  }
  if (!Number.isInteger(eventsPerTask) || eventsPerTask < 0) {
    throw new Error('eventsPerTask must be a non-negative integer');
  }
  if (!Number.isInteger(sessionCount) || sessionCount < 1) {
    throw new Error('sessionCount must be a positive integer');
  }

  if (input.replaceExisting) {
    const existing = await prisma.tenant.findUnique({
      where: { slug: input.slug },
      select: { id: true, users: { select: { id: true } } },
    });
    if (existing) {
      await deletePerformanceFixture({
        tenantId: existing.id,
        userIds: existing.users.map(({ id }) => id),
      });
    }
  }

  let tenantId: string | undefined;
  let ownedUserIds: string[] = [];
  try {
    const tenant = await prisma.tenant.create({
      data: { name: `Performance ${input.slug}`, slug: input.slug, nameKey: input.slug },
    });
    tenantId = tenant.id;
    const passwordHash = await hashPassword(input.password);
    const userRows = Array.from({ length: sessionCount }, (_, index) => ({
      id: randomUUID(),
      email: index === 0 ? input.email : `second-${index + 1}-${input.email}`,
      fullName: `Performance Admin ${index + 1}`,
      passwordHash,
      displayId: `PERF${randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase()}`,
      role: 'companyAdmin' as const,
      tenantId: tenant.id,
    }));
    ownedUserIds = userRows.map(({ id }) => id);
    await prisma.user.createMany({ data: userRows });
    const user = userRows[0];
    const team = await prisma.team.create({
      data: { tenantId: tenant.id, name: `Performance Team ${input.slug}` },
    });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id, role: 'member' } });

    const now = Date.now();
    const taskPlans = Array.from({ length: taskCount }, (_, index) => {
      const id = randomUUID();
      const createdAt = new Date(now - ((index % 90) + 1) * DAY_MS);
      const events = buildTaskEvents(id, user.id, createdAt, eventsPerTask);
      const finalStatus = events.at(-1)?.toStatus ?? 'todo';
      const startedAt = events.find((event) => event.toStatus !== 'todo')?.createdAt ?? null;
      return {
        task: {
          id,
          teamId: team.id,
          title: `${input.slug} task ${index + 1}`,
          priority: index % 3 === 0 ? ('high' as const) : ('medium' as const),
          status: finalStatus,
          isBlocked: false,
          blockedSince: null,
          blockedReason: null,
          startedAt,
          completedAt: finalStatus === 'done' ? (events.at(-1)?.createdAt ?? null) : null,
          deadline: new Date(createdAt.getTime() + 7 * DAY_MS),
          assignerId: user.id,
          createdAt,
        },
        events,
      };
    });
    const taskRows = taskPlans.map(({ task }) => task);
    await prisma.task.createMany({ data: taskRows });
    await prisma.taskAssignee.createMany({
      data: taskRows.map(({ id }) => ({ taskId: id, userId: user.id })),
    });

    const eventRows = taskPlans.flatMap(({ events }) => events);
    await prisma.taskEvent.createMany({ data: eventRows });

    const accessTokens: string[] = [];
    for (const fixtureUser of userRows) {
      const accessToken = signAccessToken(fixtureUser.id, tenant.id);
      const refreshToken = signRefreshToken(fixtureUser.id, tenant.id);
      await registerIssuedTokens(
        accessToken,
        refreshToken,
        fixtureUser.id,
        randomUUID(),
        Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      );
      accessTokens.push(accessToken);
    }

    return {
      tenantId: tenant.id,
      teamId: team.id,
      taskId: taskRows[0].id,
      taskIds: taskRows.map(({ id }) => id),
      userId: user.id,
      userIds: userRows.map(({ id }) => id),
      accessToken: accessTokens[0],
      accessTokens,
      taskCount,
      eventCount: eventRows.length,
    };
  } catch (error) {
    if (tenantId) {
      try {
        await deletePerformanceFixture({ tenantId, userIds: ownedUserIds });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Performance fixture creation and cleanup failed',
          { cause: error },
        );
      }
    }
    throw error;
  }
}

export async function deletePerformanceFixture(input: FixtureCleanup): Promise<void> {
  const { tenantId, userIds } = input;
  const errors: unknown[] = [];
  try {
    await prisma.tenant.delete({ where: { id: tenantId } });
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2025')) {
      errors.push(error);
    }
  }
  if (userIds.length > 0) {
    try {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } catch (error) {
      errors.push(error);
    }
    const sessionResults = await Promise.allSettled(
      userIds.map((userId) => revokeAllUserSessions(userId)),
    );
    errors.push(
      ...sessionResults
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason),
    );
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Performance fixture cleanup failed', { cause: errors[0] });
  }
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
          taskCount: fixture.taskCount,
          eventCount: fixture.eventCount,
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
