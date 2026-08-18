import { afterEach, describe, expect, it, vi } from 'vitest';

describe('maintenance Prisma client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('fails fast when MAINTENANCE_DATABASE_URL is missing', async () => {
    vi.stubEnv('MAINTENANCE_DATABASE_URL', '');

    await expect(import('./maintenancePrisma')).rejects.toThrow(
      'MAINTENANCE_DATABASE_URL is required for the archive worker',
    );
  });
});
