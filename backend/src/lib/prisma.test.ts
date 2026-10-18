import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Pg from 'pg';
import type * as PrismaAdapterPg from '@prisma/adapter-pg';
import type * as PrismaClientModule from '@prisma/client';

const state = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'production' as 'production' | 'development',
    APP_DATABASE_URL: 'postgresql://runtime.example/app',
    DATABASE_URL: 'postgresql://admin.example/admin',
    RUNTIME_POOL_IDLE_TIMEOUT_MS: 60_000,
    REQUEST_STAGE_TIMING: false,
  },
  handlers: {} as Record<string, (event: unknown) => void>,
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  pools: [] as Array<{
    config: unknown;
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    end: ReturnType<typeof vi.fn>;
    on: (event: string, listener: () => void) => unknown;
    emit: (event: string) => void;
    listenerCount: (event: string) => number;
  }>,
  adapters: [] as Array<{ pool: unknown; options: unknown }>,
  clientOptions: [] as unknown[],
  MockPool: class MockPool {
    totalCount = 0;
    idleCount = 0;
    waitingCount = 0;
    end = vi.fn().mockResolvedValue(undefined);
    private listeners = new Map<string, Array<() => void>>();

    constructor(readonly config: unknown) {
      state.pools.push(this);
    }

    on(event: string, listener: () => void) {
      const listeners = this.listeners.get(event) ?? [];
      listeners.push(listener);
      this.listeners.set(event, listeners);
      return this;
    }

    emit(event: string) {
      for (const listener of this.listeners.get(event) ?? []) listener();
    }

    listenerCount(event: string) {
      return this.listeners.get(event)?.length ?? 0;
    }
  },
}));

vi.mock('../env', () => ({ env: state.env }));
vi.mock('./logger', () => ({
  logger: { debug: state.debug, warn: state.warn, error: state.error },
}));
vi.mock('pg', () => ({ Pool: state.MockPool }));
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class MockPrismaPg {
    constructor(pool: unknown, options: unknown) {
      state.adapters.push({ pool, options });
    }
  },
}));
vi.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
    constructor(options: unknown) {
      state.clientOptions.push(options);
    }

    $on(event: string, handler: (payload: unknown) => void) {
      state.handlers[event] = handler;
    }
  },
}));

describe('production Prisma logging', () => {
  beforeEach(() => {
    vi.resetModules();
    const runtimeGlobal = globalThis as typeof globalThis & {
      prismaClient?: unknown;
      prismaRuntime?: unknown;
      prismaLoggingClient?: unknown;
    };
    runtimeGlobal.prismaClient = undefined;
    runtimeGlobal.prismaRuntime = undefined;
    runtimeGlobal.prismaLoggingClient = undefined;
    state.env.NODE_ENV = 'production';
    state.env.APP_DATABASE_URL = 'postgresql://runtime.example/app';
    state.env.RUNTIME_POOL_IDLE_TIMEOUT_MS = 60_000;
    state.env.REQUEST_STAGE_TIMING = false;
    state.handlers = {};
    state.debug.mockReset();
    state.pools.length = 0;
    state.adapters.length = 0;
    state.clientOptions.length = 0;
  });

  it('does not log production query text or params', async () => {
    await import('./prisma');
    state.handlers.query({
      query: 'SELECT * FROM users WHERE email = $1',
      params: '["secret@example.com"]',
      duration: 4,
      target: 'quaint::connector',
    });

    expect(state.debug).toHaveBeenCalledWith(
      { duration: 4, target: 'quaint::connector' },
      'prisma:query',
    );
    expect(state.debug).not.toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.anything(), params: expect.anything() }),
      expect.anything(),
    );
    expect(state.pools).toHaveLength(1);
    expect(state.pools[0].config).toEqual({
      connectionString: 'postgresql://runtime.example/app',
      idleTimeoutMillis: 60_000,
    });
    expect(state.adapters).toEqual([
      { pool: state.pools[0], options: { disposeExternalPool: true } },
    ]);
    expect(state.pools[0].listenerCount('connect')).toBe(0);
    expect(state.pools[0].listenerCount('acquire')).toBe(0);
    expect(state.pools[0].listenerCount('remove')).toBe(0);
  });

  it('uses the configured runtime pool idle retention value', async () => {
    state.env.RUNTIME_POOL_IDLE_TIMEOUT_MS = 10_000;

    await import('./prisma');

    expect(state.pools[0].config).toEqual({
      connectionString: 'postgresql://runtime.example/app',
      idleTimeoutMillis: 10_000,
    });
  });

  it('rejects production runtime without APP_DATABASE_URL', async () => {
    state.env.APP_DATABASE_URL = undefined as unknown as string;

    await expect(import('./prisma')).rejects.toThrow('APP_DATABASE_URL is required');
    expect(state.pools).toHaveLength(0);
  });

  it('records public pool gauges and cumulative events once across development reloads', async () => {
    state.env.NODE_ENV = 'development';
    state.env.REQUEST_STAGE_TIMING = true;

    const first = await import('./prisma');
    const pool = state.pools[0];
    pool.totalCount = 4;
    pool.idleCount = 2;
    pool.waitingCount = 1;
    pool.emit('connect');
    pool.emit('acquire');
    pool.emit('remove');

    expect(first.getRuntimePoolSnapshot()).toEqual({
      totalCount: 4,
      idleCount: 2,
      waitingCount: 1,
      connectCount: 1,
      acquireCount: 1,
      removeCount: 1,
    });

    vi.resetModules();
    const second = await import('./prisma');

    expect(second.prisma).toBe(first.prisma);
    expect(state.pools).toHaveLength(1);
    expect(state.adapters).toHaveLength(1);
    expect(pool.listenerCount('connect')).toBe(1);
    expect(pool.listenerCount('acquire')).toBe(1);
    expect(pool.listenerCount('remove')).toBe(1);
    pool.emit('acquire');
    expect(second.getRuntimePoolSnapshot().acquireCount).toBe(2);
  });

  it('does not attach pool event listeners when request timing is disabled', async () => {
    const { getRuntimePoolSnapshot } = await import('./prisma');
    const pool = state.pools[0];

    pool.emit('connect');
    expect(pool.listenerCount('connect')).toBe(0);
    expect(getRuntimePoolSnapshot().connectCount).toBe(0);
  });

  it('ends an externally supplied pool once when Prisma disconnects', async () => {
    const [{ Pool }, { PrismaPg }, { PrismaClient }] = await Promise.all([
      vi.importActual<typeof Pg>('pg'),
      vi.importActual<typeof PrismaAdapterPg>('@prisma/adapter-pg'),
      vi.importActual<typeof PrismaClientModule>('@prisma/client'),
    ]);
    const pool = new Pool({ connectionString: 'postgresql://127.0.0.1/not-used' });
    const end = vi.spyOn(pool, 'end');
    const client = new PrismaClient({
      adapter: new PrismaPg(pool, { disposeExternalPool: true }),
      log: [],
    });

    await client.$connect();
    await client.$disconnect();

    expect(end).toHaveBeenCalledTimes(1);
  });
});
