import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factory hoist edilir; bu yüzden mock'ları factory içinde tanımla
vi.mock('../lib/prisma', () => {
  const mockExecuteRawUnsafe = vi.fn().mockResolvedValue(0);
  const mockTransaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ $executeRawUnsafe: mockExecuteRawUnsafe }),
  );
  return {
    prisma: { $transaction: mockTransaction },
    mockExecuteRawUnsafe,
    mockTransaction,
  };
});

import { withTenantContext } from './withTenant';
import { mockExecuteRawUnsafe, mockTransaction } from '../lib/prisma';

describe('withTenantContext', () => {
  beforeEach(() => {
    mockExecuteRawUnsafe.mockClear();
    mockTransaction.mockClear();
  });

  it('SET LOCAL ROLE authenticated ÖNCE çağrılır (RLS policy için zorunlu)', async () => {
    await withTenantContext('user-uuid-123', 'tenant-uuid-456', async () => 'ok');

    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(3);
    expect(mockExecuteRawUnsafe).toHaveBeenNthCalledWith(1, 'SET LOCAL ROLE authenticated');
    expect(mockExecuteRawUnsafe).toHaveBeenNthCalledWith(
      2,
      "SET LOCAL app.user_id = 'user-uuid-123'",
    );
    expect(mockExecuteRawUnsafe).toHaveBeenNthCalledWith(
      3,
      "SET LOCAL app.tenant_id = 'tenant-uuid-456'",
    );
  });

  it("callback'i transaction içinde çalıştırır", async () => {
    const mockFn = vi.fn().mockResolvedValue('result');
    const result = await withTenantContext('u', 't', mockFn);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it("callback'in döndürdüğü değeri döner", async () => {
    const result = await withTenantContext('u', 't', async () => 42);
    expect(result).toBe(42);
  });

  it('SET LOCAL çağrılarından ÖNCE callback çağrılmaz', async () => {
    const callOrder: string[] = [];
    mockExecuteRawUnsafe.mockImplementation(async () => {
      callOrder.push('SET_LOCAL');
    });
    const mockFn = vi.fn().mockImplementation(async () => {
      callOrder.push('CALLBACK');
      return 'ok';
    });

    await withTenantContext('u', 't', mockFn);

    expect(callOrder).toEqual(['SET_LOCAL', 'SET_LOCAL', 'SET_LOCAL', 'CALLBACK']);
  });
});
