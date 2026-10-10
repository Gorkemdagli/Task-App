import { redis } from './redis';
import { verifyAccessToken, verifyRefreshToken } from './jwt';

const USER_SESSION_INDEX = (userId: string) => `user-sessions:${userId}`;
const ACCESS_SESSION_KEY = (jti: string) => `access-session:${jti}`;
const REFRESH_SESSION_KEY = (jti: string) => `session:${jti}`;
const BLACKLIST_KEY = (jti: string) => `blacklist:jti:${jti}`;

const ROTATE_SESSION_SCRIPT = `
local function keytype(key)
  return redis.call('TYPE', key).ok
end
local oldType = keytype(KEYS[1])
local indexType = keytype(KEYS[3])
if (oldType ~= 'string' or (indexType ~= 'none' and indexType ~= 'set') or
    keytype(KEYS[2]) ~= 'none' or keytype(KEYS[4]) ~= 'none' or keytype(KEYS[5]) ~= 'none' or
    tonumber(ARGV[4]) <= 0 or tonumber(ARGV[4]) ~= math.floor(tonumber(ARGV[4])) or
    tonumber(ARGV[5]) <= 0 or tonumber(ARGV[5]) ~= math.floor(tonumber(ARGV[5])) or
    tonumber(ARGV[6]) <= 0 or tonumber(ARGV[6]) ~= math.floor(tonumber(ARGV[6])) or
    redis.call('SISMEMBER', KEYS[3], KEYS[1]) ~= 1) then
  return 0
end
local current = cjson.decode(redis.call('GET', KEYS[1]))
if current.userId ~= ARGV[1] or current.familyId ~= ARGV[2] or
    tonumber(current.sessionExpiresAt) ~= tonumber(ARGV[3]) then
  return 0
end
redis.call('SET', KEYS[2], '1', 'EX', ARGV[4])
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[3], KEYS[1])
redis.call('SADD', KEYS[3], KEYS[4], KEYS[5])
redis.call('EXPIRE', KEYS[3], math.max(tonumber(ARGV[5]), tonumber(ARGV[6])))
redis.call('SET', KEYS[4], ARGV[7], 'EX', ARGV[5])
redis.call('SET', KEYS[5], ARGV[7], 'EX', ARGV[6])
return 1
`;

const REVOKE_ALL_SESSIONS_SCRIPT = `
local indexType = redis.call('TYPE', KEYS[1]).ok
if indexType ~= 'none' and indexType ~= 'set' then return redis.error_reply('invalid session index type') end
local keys = redis.call('SMEMBERS', KEYS[1])
for _, key in ipairs(keys) do redis.call('DEL', key) end
redis.call('DEL', KEYS[1])
return #keys
`;

export type SessionRecord = {
  userId: string;
  familyId: string;
  sessionExpiresAt: number;
};

function remainingTtl(exp: number): number {
  return Math.max(1, exp - Math.floor(Date.now() / 1000));
}

export function accessSessionKey(jti: string): string {
  return ACCESS_SESSION_KEY(jti);
}

export function refreshSessionKey(jti: string): string {
  return REFRESH_SESSION_KEY(jti);
}

export async function registerIssuedTokens(
  accessToken: string,
  refreshToken: string,
  userId: string,
  familyId: string,
  sessionExpiresAt: number,
): Promise<void> {
  const access = verifyAccessToken(accessToken);
  const refresh = verifyRefreshToken(refreshToken);
  const refreshExpiresAt = Math.min(refresh.exp, sessionExpiresAt);
  const accessKey = ACCESS_SESSION_KEY(access.jti);
  const refreshKey = REFRESH_SESSION_KEY(refresh.jti);
  const indexKey = USER_SESSION_INDEX(userId);
  const value = JSON.stringify({ userId, familyId, sessionExpiresAt });
  const transaction = redis.multi();

  transaction.set(accessKey, value, 'EX', remainingTtl(access.exp));
  transaction.set(refreshKey, value, 'EX', remainingTtl(refreshExpiresAt));
  transaction.sadd(indexKey, accessKey, refreshKey);
  transaction.expire(indexKey, remainingTtl(refreshExpiresAt));
  await transaction.exec();
}

export async function getRefreshSession(jti: string): Promise<SessionRecord | null> {
  const value = await redis.get(REFRESH_SESSION_KEY(jti));
  if (!value) return null;
  try {
    return JSON.parse(value) as SessionRecord;
  } catch {
    return null;
  }
}

export async function hasAccessSession(jti: string): Promise<boolean> {
  return (await redis.exists(ACCESS_SESSION_KEY(jti))) === 1;
}

export async function rotateSessionTokens(
  oldJti: string,
  expected: SessionRecord,
  blacklistTtl: number,
  accessToken: string,
  refreshToken: string,
): Promise<boolean> {
  const access = verifyAccessToken(accessToken);
  const refresh = verifyRefreshToken(refreshToken);
  const accessKey = ACCESS_SESSION_KEY(access.jti);
  const refreshKey = REFRESH_SESSION_KEY(refresh.jti);
  const value = JSON.stringify(expected);
  const accessTtl = remainingTtl(access.exp);
  const refreshTtl = remainingTtl(Math.min(refresh.exp, expected.sessionExpiresAt));

  return (await redis.eval(
    ROTATE_SESSION_SCRIPT,
    5,
    REFRESH_SESSION_KEY(oldJti),
    BLACKLIST_KEY(oldJti),
    USER_SESSION_INDEX(expected.userId),
    accessKey,
    refreshKey,
    expected.userId,
    expected.familyId,
    expected.sessionExpiresAt,
    blacklistTtl,
    accessTtl,
    refreshTtl,
    value,
  )) === 1;
}

export async function removeSessionKeys(userId: string, keys: string[]): Promise<void> {
  if (!keys.length) return;
  const transaction = redis.multi();
  transaction.del(...keys);
  transaction.srem(USER_SESSION_INDEX(userId), ...keys);
  await transaction.exec();
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await redis.eval(REVOKE_ALL_SESSIONS_SCRIPT, 1, USER_SESSION_INDEX(userId));
}
