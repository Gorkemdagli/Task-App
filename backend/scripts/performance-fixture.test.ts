import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';

const { registerIssuedTokensMock, revokeAllUserSessionsMock } = vi.hoisted(() => ({
  registerIssuedTokensMock: vi.fn(),
  revokeAllUserSessionsMock: vi.fn(),
}));

vi.mock('../src/lib/sessionStore', () => ({
  registerIssuedTokens: registerIssuedTokensMock,
  revokeAllUserSessions: revokeAllUserSessionsMock,
}));

import { createPerformanceFixture, deletePerformanceFixture } from './performance-fixture';

describe('performance fixture auth', () => {
  it('registers the benchmark access token as an active session', async () => {
    registerIssuedTokensMock.mockReset();
    revokeAllUserSessionsMock.mockReset();
    const fixture = await createPerformanceFixture({
      slug: `perf-test-${randomUUID()}`,
      email: `perf-test-${randomUUID()}@taskflow.test`,
      password: 'PerfOnly-2026!',
    });

    try {
    expect(registerIssuedTokensMock).toHaveBeenCalledTimes(2);
    expect(registerIssuedTokensMock).toHaveBeenCalledWith(
        fixture.accessToken,
        expect.any(String),
        fixture.userId,
        expect.any(String),
        expect.any(Number),
      );
    } finally {
      await deletePerformanceFixture(fixture);
    }
  });

  it('keeps final task state and lifecycle timestamps aligned with valid events', async () => {
    const fixture = await createPerformanceFixture({
      slug: `perf-invariant-${randomUUID()}`,
      email: `perf-invariant-${randomUUID()}@taskflow.test`,
      password: 'PerfOnly-2026!',
      taskCount: 3,
      eventsPerTask: 5,
    });

    try {
      const tasks = await prisma.task.findMany({
        where: { id: { in: fixture.taskIds } },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
      expect(tasks).toHaveLength(3);
      for (const task of tasks) {
        let status = 'todo';
        for (const event of task.events) {
          expect(event.fromStatus).toBe(status);
          status = event.toStatus ?? status;
        }
        expect(task.status).toBe(status);
        expect(task.isBlocked).toBe(false);
        expect(task.blockedSince).toBeNull();
        expect(task.blockedReason).toBeNull();
        expect(task.startedAt).not.toBeNull();
        expect(task.completedAt).toBe(status === 'done' ? task.events.at(-1)?.createdAt : null);
      }
    } finally {
      await deletePerformanceFixture(fixture);
    }
  });

  it('deletes explicitly owned users and requests session revocation', async () => {
    const fixture = await createPerformanceFixture({
      slug: `perf-cleanup-${randomUUID()}`,
      email: `perf-cleanup-${randomUUID()}@taskflow.test`,
      password: 'PerfOnly-2026!',
    });
    revokeAllUserSessionsMock.mockReset();

    await deletePerformanceFixture(fixture);

    expect(await prisma.user.count({ where: { id: { in: fixture.userIds } } })).toBe(0);
    expect(revokeAllUserSessionsMock).toHaveBeenCalledTimes(fixture.userIds.length);
  });

  it('cleans the tenant and owned users when fixture creation fails partway', async () => {
    const slug = `perf-partial-${randomUUID()}`;
    const email = `perf-partial-${randomUUID()}@taskflow.test`;
    const conflictingUser = await prisma.user.create({
      data: {
        email,
        fullName: 'Existing User',
        passwordHash: 'not-used',
        displayId: `PARTIAL${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
        role: 'member',
      },
    });

    try {
      await expect(
        createPerformanceFixture({ slug, email, password: 'PerfOnly-2026!' }),
      ).rejects.toBeDefined();
      expect(await prisma.tenant.findUnique({ where: { slug } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { email: `second-2-${email}` } })).toBeNull();
    } finally {
      await prisma.user.delete({ where: { id: conflictingUser.id } });
    }
  });
});
