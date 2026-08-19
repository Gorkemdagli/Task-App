import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => {
  const mockExecuteRaw = vi.fn().mockResolvedValue(0);
  const tx = { $executeRaw: mockExecuteRaw };
  const mockTransaction = vi.fn(async (cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
  return {
    prisma: { $transaction: mockTransaction },
    mockExecuteRaw,
    mockTransaction,
    tx,
  };
});

import { commitThenThrow, withTenantContext } from './withTenant';
import { mockExecuteRaw, mockTransaction, tx } from '../lib/prisma';

describe('withTenantContext', () => {
  beforeEach(() => {
    mockExecuteRaw.mockClear();
    mockTransaction.mockClear();
  });

  it('parametreli context SQL sırasını transaction içinde uygular', async () => {
    const work = vi.fn().mockResolvedValue('ok');

    await withTenantContext('user-uuid-123', 'tenant-uuid-456', work);

    expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
    expect(mockExecuteRaw.mock.calls[0][0]).toEqual(['SET LOCAL ROLE authenticated']);
    expect(mockExecuteRaw.mock.calls[1][0]).toEqual([
      "SELECT set_config('app.user_id', ",
      ', true)',
    ]);
    expect(mockExecuteRaw.mock.calls[1][1]).toBe('user-uuid-123');
    expect(mockExecuteRaw.mock.calls[2][0]).toEqual([
      "SELECT set_config('app.tenant_id', ",
      ', true)',
    ]);
    expect(mockExecuteRaw.mock.calls[2][1]).toBe('tenant-uuid-456');
    expect(work).toHaveBeenCalledWith(tx);
  });

  it('callback hatasını transaction dışına taşır', async () => {
    const failure = new Error('rollback');
    const work = vi.fn().mockRejectedValue(failure);

    await expect(withTenantContext('u', 't', work)).rejects.toBe(failure);
  });

  it('transaction sonucunu döner', async () => {
    const result = await withTenantContext('u', 't', async () => 42);

    expect(result).toBe(42);
  });

  it('P2034 için yeni transaction ile retry yapar', async () => {
    const conflict = Object.assign(new Error('serialization'), { code: 'P2034' });
    mockTransaction
      .mockImplementationOnce(async (cb) => {
        await cb(tx);
        throw conflict;
      })
      .mockImplementationOnce(async (cb) => {
        await cb(tx);
        throw conflict;
      })
      .mockImplementationOnce(async (cb) => cb(tx));

    await expect(withTenantContext('u', 't', async () => 'ok', { maxRetries: 3 })).resolves.toBe(
      'ok',
    );
    expect(mockTransaction).toHaveBeenCalledTimes(3);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(9);
  });

  it('retry sonrası P2034 için 409 döner', async () => {
    const conflict = Object.assign(new Error('serialization'), { code: 'P2034' });
    mockTransaction.mockImplementation(async (cb) => {
      await cb(tx);
      throw conflict;
    });

    await expect(
      withTenantContext('u', 't', async () => 'ok', { maxRetries: 3 }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONCURRENT_MODIFICATION',
    });
    expect(mockTransaction).toHaveBeenCalledTimes(3);
  });

  it('business error retry edilmez', async () => {
    const failure = new Error('business');
    mockTransaction.mockImplementationOnce(async (cb) => cb(tx));
    const work = vi.fn().mockRejectedValue(failure);

    await expect(withTenantContext('u', 't', work, { maxRetries: 3 })).rejects.toBe(failure);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('commits deferred business errors before returning them', async () => {
    let committed = false;
    mockTransaction.mockImplementationOnce(async (cb) => {
      const result = await cb(tx);
      committed = true;
      return result;
    });
    const failure = new Error('commit');

    await expect(withTenantContext('u', 't', async () => commitThenThrow(failure))).rejects.toBe(
      failure,
    );
    expect(committed).toBe(true);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
