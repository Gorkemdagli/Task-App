import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';

const { withTenantContext } = vi.hoisted(() => ({ withTenantContext: vi.fn() }));

vi.mock('../db/withTenant', () => ({ withTenantContext }));

import { runTenantRequest } from './runTenantRequest';

const actor = {
  id: 'user-id',
  role: 'companyAdmin' as const,
  tenantId: 'tenant-id',
};

function reqWith(user: typeof actor | { tenantId: null }): Request {
  return { user } as Request;
}

describe('runTenantRequest', () => {
  beforeEach(() => {
    withTenantContext.mockReset();
  });

  it('tenantless actor için transaction açmadan 403 döner', async () => {
    const work = vi.fn();

    await expect(runTenantRequest(reqWith({ tenantId: null }), work)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_TENANT',
    });
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('401 without authenticated actor', async () => {
    const work = vi.fn();

    await expect(runTenantRequest({} as Request, work)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('aynı db ve actor nesnesini work callbackine verir', async () => {
    const tx = {};
    const work = vi.fn().mockResolvedValue('done');
    withTenantContext.mockImplementation(async (_userId, _tenantId, callback) => callback(tx));

    await runTenantRequest(reqWith(actor), work);

    expect(withTenantContext).toHaveBeenCalledWith('user-id', 'tenant-id', expect.any(Function));
    expect(work).toHaveBeenCalledWith(tx, actor);
  });

  it('transaction seçeneklerini iletir', async () => {
    const tx = {};
    const work = vi.fn().mockResolvedValue('done');
    withTenantContext.mockImplementation(async (_userId, _tenantId, callback) => callback(tx));

    await runTenantRequest(reqWith(actor), work, { maxRetries: 3 });

    expect(withTenantContext).toHaveBeenCalledWith('user-id', 'tenant-id', expect.any(Function), {
      maxRetries: 3,
    });
  });
});
