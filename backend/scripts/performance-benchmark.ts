import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { createPerformanceFixture, deletePerformanceFixture } from './performance-fixture';

export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) throw new Error('Cannot calculate percentile of empty values');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

async function request(baseUrl: string, token: string, path: string, init?: RequestInit) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const elapsed = performance.now() - started;
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} returned ${response.status}`);
  return elapsed;
}

async function main() {
  const password = process.env.PERF_PASSWORD ?? 'PerfOnly-2026!';
  const email = process.env.PERF_EMAIL ?? `perf-${randomUUID()}@taskflow.test`;
  const fixture = await createPerformanceFixture({
    slug: `perf-api-${randomUUID()}`,
    email,
    password,
  });
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Benchmark server did not expose port');
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    for (let index = 0; index < 5; index += 1)
      await request(baseUrl, fixture.accessToken, '/tasks?limit=20');
    for (let index = 0; index < 3; index += 1) {
      await request(baseUrl, fixture.accessToken, `/tasks/${fixture.taskId}/priority`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: index % 2 ? 'high' : 'low' }),
      });
    }
    const reads: number[] = [];
    for (let index = 0; index < 50; index += 1)
      reads.push(await request(baseUrl, fixture.accessToken, '/tasks?limit=20'));
    const writes: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      writes.push(
        await request(baseUrl, fixture.accessToken, `/tasks/${fixture.taskId}/priority`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ priority: index % 2 ? 'high' : 'low' }),
        }),
      );
    }
    const readP95 = percentile(reads, 0.95);
    const writeP95 = percentile(writes, 0.95);
    console.log(`read p95: ${readP95.toFixed(1)}ms / 300ms`);
    console.log(`write p95: ${writeP95.toFixed(1)}ms / 500ms`);
    if (readP95 > 300 || writeP95 > 500) throw new Error('API p95 budget exceeded');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await deletePerformanceFixture(fixture.tenantId);
    await prisma.$disconnect();
    await redis.quit();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
