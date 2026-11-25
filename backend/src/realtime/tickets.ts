import { createHash, randomBytes } from 'node:crypto';
import { redis } from '../lib/redis';

export const REALTIME_TICKET_TTL_SECONDS = 30;

export type RealtimeTicketIdentity = {
  jti: string;
  userId: string;
  tenantId: string | null;
};

const keyFor = (ticket: string) =>
  `realtime-ticket:${createHash('sha256').update(ticket).digest('hex')}`;

const CONSUME_TICKET_SCRIPT = `
local ticket = redis.call('GET', KEYS[1])
if not ticket then return nil end
redis.call('DEL', KEYS[1])
return ticket
`;

export async function issueRealtimeTicket(identity: RealtimeTicketIdentity): Promise<string> {
  const ticket = randomBytes(32).toString('base64url');
  const stored = await redis.set(
    keyFor(ticket),
    JSON.stringify(identity),
    'EX',
    REALTIME_TICKET_TTL_SECONDS,
    'NX',
  );
  if (stored !== 'OK') throw new Error('Unable to issue realtime ticket');
  return ticket;
}

export async function consumeRealtimeTicket(
  ticket: string,
): Promise<RealtimeTicketIdentity | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) return null;

  const value: unknown = await redis.eval(CONSUME_TICKET_SCRIPT, 1, keyFor(ticket));
  if (typeof value !== 'string') return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('jti' in parsed) || typeof parsed.jti !== 'string' || !parsed.jti ||
      !('userId' in parsed) || typeof parsed.userId !== 'string' || !parsed.userId ||
      !('tenantId' in parsed) ||
      (parsed.tenantId !== null && typeof parsed.tenantId !== 'string')
    ) {
      return null;
    }
    return { jti: parsed.jti, userId: parsed.userId, tenantId: parsed.tenantId };
  } catch {
    return null;
  }
}
