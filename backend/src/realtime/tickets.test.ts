import { randomUUID, createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { redis } from '../lib/redis';
import { consumeRealtimeTicket, issueRealtimeTicket } from './tickets';

describe('realtime tickets', () => {
  beforeEach(async () => {
    const keys = await redis.keys('realtime-ticket:*');
    if (keys.length) await redis.del(...keys);
  });

  it('issues a short-lived opaque ticket and atomically consumes it once', async () => {
    const identity = {
      jti: randomUUID(),
      userId: randomUUID(),
      tenantId: randomUUID(),
    };

    const ticket = await issueRealtimeTicket(identity);

    expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const key = `realtime-ticket:${createHash('sha256').update(ticket).digest('hex')}`;
    expect(await redis.ttl(key)).toBeGreaterThan(0);
    expect(await redis.ttl(key)).toBeLessThanOrEqual(30);

    const redemptions = await Promise.all([
      consumeRealtimeTicket(ticket),
      consumeRealtimeTicket(ticket),
    ]);

    expect(redemptions.filter(Boolean)).toHaveLength(1);
    expect(redemptions.filter(Boolean)[0]).toEqual(identity);
    expect(await consumeRealtimeTicket(ticket)).toBeNull();
  });
});
