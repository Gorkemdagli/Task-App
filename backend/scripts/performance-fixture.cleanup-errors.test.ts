import { describe, expect, it, vi } from 'vitest';

const {
  tenantCreateMock,
  tenantDeleteMock,
  userCreateManyMock,
  userDeleteManyMock,
  revokeAllUserSessionsMock,
} = vi.hoisted(() => ({
  tenantCreateMock: vi.fn(),
  tenantDeleteMock: vi.fn(),
  userCreateManyMock: vi.fn(),
  userDeleteManyMock: vi.fn(),
  revokeAllUserSessionsMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    tenant: { create: tenantCreateMock, delete: tenantDeleteMock },
    user: { createMany: userCreateManyMock, deleteMany: userDeleteManyMock },
  },
}));

vi.mock('../src/lib/sessionStore', () => ({
  registerIssuedTokens: vi.fn(),
  revokeAllUserSessions: revokeAllUserSessionsMock,
}));

vi.mock('../src/lib/redis', () => ({ redis: { quit: vi.fn() } }));

import { createPerformanceFixture, deletePerformanceFixture } from './performance-fixture';

describe('performance fixture cleanup error handling', () => {
  it('attempts tenant, users, and every session even when cleanup steps fail', async () => {
    tenantDeleteMock.mockRejectedValueOnce(new Error('tenant cleanup failed'));
    userDeleteManyMock.mockRejectedValueOnce(new Error('user cleanup failed'));
    revokeAllUserSessionsMock
      .mockRejectedValueOnce(new Error('session one cleanup failed'))
      .mockResolvedValueOnce(undefined);

    let thrown: unknown;
    try {
      await deletePerformanceFixture({ tenantId: 'tenant-id', userIds: ['user-one', 'user-two'] });
    } catch (error) {
      thrown = error;
    }

    expect(tenantDeleteMock).toHaveBeenCalledOnce();
    expect(userDeleteManyMock).toHaveBeenCalledOnce();
    expect(revokeAllUserSessionsMock).toHaveBeenCalledTimes(2);
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toHaveLength(3);
  });

  it('preserves the primary creation error when cleanup also fails', async () => {
    const primaryError = new Error('fixture creation failed');
    tenantCreateMock.mockResolvedValueOnce({ id: 'tenant-id' });
    userCreateManyMock.mockRejectedValueOnce(primaryError);
    tenantDeleteMock.mockRejectedValueOnce(new Error('tenant cleanup failed'));
    userDeleteManyMock.mockRejectedValueOnce(new Error('user cleanup failed'));
    revokeAllUserSessionsMock.mockRejectedValue(new Error('session cleanup failed'));

    let thrown: unknown;
    try {
      await createPerformanceFixture({
        slug: 'perf-cleanup-errors',
        email: 'perf-cleanup-errors@taskflow.test',
        password: 'PerfOnly-2026!',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.cause).toBe(primaryError);
    expect(aggregate.errors).toHaveLength(2);
    expect((aggregate.errors[0] as Error).message).toBe('fixture creation failed');
    expect(aggregate.errors[1]).toBeInstanceOf(AggregateError);
    expect(tenantDeleteMock).toHaveBeenCalled();
    expect(userDeleteManyMock).toHaveBeenCalled();
    expect(revokeAllUserSessionsMock).toHaveBeenCalledTimes(2);
  });
});
