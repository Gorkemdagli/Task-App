import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';

const { registerIssuedTokensMock } = vi.hoisted(() => ({
  registerIssuedTokensMock: vi.fn(),
}));

vi.mock('../src/lib/sessionStore', () => ({
  registerIssuedTokens: registerIssuedTokensMock,
}));

import { createPerformanceFixture } from './performance-fixture';

describe('performance fixture auth', () => {
  it('registers the benchmark access token as an active session', async () => {
    registerIssuedTokensMock.mockReset();
    const fixture = await createPerformanceFixture({
      slug: `perf-test-${randomUUID()}`,
      email: `perf-test-${randomUUID()}@taskflow.test`,
      password: 'PerfOnly-2026!',
    });

    try {
      expect(registerIssuedTokensMock).toHaveBeenCalledWith(
        fixture.accessToken,
        expect.any(String),
        fixture.userId,
      );
    } finally {
      await prisma.tenant.delete({ where: { id: fixture.tenantId } });
    }
  });
});
