import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ urls: [] as string[] }));

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class MockPrismaPg {
    constructor(options: { connectionString: string }) {
      state.urls.push(options.connectionString);
    }
  },
}));
vi.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {},
}));

describe('maintenance Prisma client', () => {
  beforeEach(() => {
    vi.resetModules();
    state.urls = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('fails fast when MAINTENANCE_DATABASE_URL is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MAINTENANCE_DATABASE_URL', '');

    await expect(import('./maintenancePrisma')).rejects.toThrow(
      'MAINTENANCE_DATABASE_URL is required for the archive worker',
    );
  });

  it('uses DATABASE_URL as the local development maintenance connection', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MAINTENANCE_DATABASE_URL', '');
    vi.stubEnv('DATABASE_URL', 'postgresql://local.example/taskflow');

    await import('./maintenancePrisma');

    expect(state.urls).toEqual(['postgresql://local.example/taskflow']);
  });
});
