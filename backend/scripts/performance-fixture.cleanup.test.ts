import { describe, expect, it, vi } from 'vitest';

const { disconnectMock, quitMock } = vi.hoisted(() => ({
  disconnectMock: vi.fn().mockResolvedValue(undefined),
  quitMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: { $disconnect: disconnectMock },
}));

vi.mock('../src/lib/redis', () => ({
  redis: { quit: quitMock },
}));

import { closePerformanceFixtureResources } from './performance-fixture';

describe('performance fixture cleanup', () => {
  it('closes Prisma and Redis resources', async () => {
    await closePerformanceFixtureResources();

    expect(disconnectMock).toHaveBeenCalledOnce();
    expect(quitMock).toHaveBeenCalledOnce();
  });
});
