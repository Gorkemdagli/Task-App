import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'production' as 'production' | 'development',
    APP_DATABASE_URL: 'postgresql://runtime.example/app',
    DATABASE_URL: 'postgresql://admin.example/admin',
  },
  handlers: {} as Record<string, (event: unknown) => void>,
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  urls: [] as string[],
}));

vi.mock('../env', () => ({ env: state.env }));
vi.mock('./logger', () => ({
  logger: { debug: state.debug, warn: state.warn, error: state.error },
}));
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class MockPrismaPg {
    constructor(options: { connectionString: string }) {
      state.urls.push(options.connectionString);
    }
  },
}));
vi.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
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
      prismaLoggingClient?: unknown;
    };
    runtimeGlobal.prismaClient = undefined;
    runtimeGlobal.prismaLoggingClient = undefined;
    state.env.NODE_ENV = 'production';
    state.env.APP_DATABASE_URL = 'postgresql://runtime.example/app';
    state.handlers = {};
    state.debug.mockReset();
    state.urls = [];
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
    expect(state.urls).toEqual(['postgresql://runtime.example/app']);
  });

  it('rejects production runtime without APP_DATABASE_URL', async () => {
    state.env.APP_DATABASE_URL = undefined as unknown as string;

    await expect(import('./prisma')).rejects.toThrow('APP_DATABASE_URL is required');
  });
});
