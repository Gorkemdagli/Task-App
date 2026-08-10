import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  findTenants: vi.fn(),
  transaction: vi.fn(),
  archive: vi.fn(),
  apply: vi.fn(),
}));

vi.mock('../lib/maintenancePrisma', () => ({
  maintenancePrisma: {
    tenant: { findMany: state.findTenants },
    $transaction: state.transaction,
  },
}));
vi.mock('../services/tasks.archive', () => ({
  archiveExpiredTasks: state.archive,
  applyExpiredPendingStatuses: state.apply,
}));

describe('archive worker isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    state.findTenants.mockReset();
    state.transaction.mockReset();
    state.archive.mockReset();
    state.apply.mockReset();
  });

  it('continues with the next tenant after a batch failure', async () => {
    state.findTenants.mockResolvedValue([{ id: 'tenant-a' }, { id: 'tenant-b' }]);
    state.transaction.mockImplementation((work: (db: unknown) => Promise<unknown>) => work({}));
    state.archive.mockImplementation(async (_db: unknown, tenantId: string) => {
      if (tenantId === 'tenant-a') throw new Error('tenant-a failed');
      return { archivedCount: 2 };
    });
    state.apply.mockResolvedValue({ appliedCount: 3 });

    const { runArchiveBatch } = await import('../archive-worker');
    await expect(runArchiveBatch()).resolves.toEqual({ archivedCount: 2, appliedCount: 3 });

    expect(state.archive).toHaveBeenCalledWith(expect.anything(), 'tenant-a');
    expect(state.archive).toHaveBeenCalledWith(expect.anything(), 'tenant-b');
    expect(state.apply).toHaveBeenCalledTimes(1);
    expect(state.apply).toHaveBeenCalledWith(expect.anything(), 'tenant-b');
  });

  it('keeps the web entrypoint free of worker-only dependencies', () => {
    const indexSource = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');

    expect(indexSource).not.toContain('node-cron');
    expect(indexSource).not.toContain('tasks.archive');
    expect(indexSource).not.toContain('MAINTENANCE_DATABASE_URL');
    expect(indexSource).not.toContain('maintenancePrisma');
  });
});
