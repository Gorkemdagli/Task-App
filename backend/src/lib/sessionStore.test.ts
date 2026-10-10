import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { redis } from './redis';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt';
import {
  hasAccessSession,
  registerIssuedTokens,
  removeSessionKeys,
  revokeAllUserSessions,
  rotateSessionTokens,
} from './sessionStore';

async function cleanRedis() {
  const keys = await redis.keys('access-session:*');
  keys.push(...(await redis.keys('session:*')));
  keys.push(...(await redis.keys('user-sessions:*')));
  keys.push(...(await redis.keys('blacklist:jti:*')));
  if (keys.length) await redis.del(...keys);
}

describe('sessionStore', () => {
  beforeEach(cleanRedis);

  it('indexes access and refresh sessions under user ID', async () => {
    const userId = randomUUID();
    const accessToken = signAccessToken(userId, null);
    const refreshToken = signRefreshToken(userId, null);
    const familyId = randomUUID();
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    await registerIssuedTokens(accessToken, refreshToken, userId, familyId, sessionExpiresAt);

    const accessJti = verifyAccessToken(accessToken).jti;
    const refreshJti = verifyRefreshToken(refreshToken).jti;
    expect(await hasAccessSession(accessJti)).toBe(true);
    expect(await redis.sismember(`user-sessions:${userId}`, `access-session:${accessJti}`)).toBe(1);
    expect(await redis.sismember(`user-sessions:${userId}`, `session:${refreshJti}`)).toBe(1);
    expect(JSON.parse((await redis.get(`session:${refreshJti}`))!)).toEqual({
      userId,
      familyId,
      sessionExpiresAt,
    });

    await removeSessionKeys(userId, [`session:${refreshJti}`]);
    expect(await redis.sismember(`user-sessions:${userId}`, `session:${refreshJti}`)).toBe(0);
  });

  it('revokes every indexed session for a user', async () => {
    const userId = randomUUID();
    const firstAccess = signAccessToken(userId, null);
    const firstRefresh = signRefreshToken(userId, null);
    const secondAccess = signAccessToken(userId, null);
    const secondRefresh = signRefreshToken(userId, null);
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    await registerIssuedTokens(firstAccess, firstRefresh, userId, randomUUID(), sessionExpiresAt);
    await registerIssuedTokens(secondAccess, secondRefresh, userId, randomUUID(), sessionExpiresAt);
    await revokeAllUserSessions(userId);

    expect(await hasAccessSession(verifyAccessToken(firstAccess).jti)).toBe(false);
    expect(await hasAccessSession(verifyAccessToken(secondAccess).jti)).toBe(false);
    expect(await redis.exists(`user-sessions:${userId}`)).toBe(0);
    expect(await redis.exists(`session:${verifyRefreshToken(firstRefresh).jti}`)).toBe(0);
    expect(await redis.exists(`session:${verifyRefreshToken(secondRefresh).jti}`)).toBe(0);
  });

  it('atomically allows only one rotation of a refresh session', async () => {
    const userId = randomUUID();
    const familyId = randomUUID();
    const oldRefresh = signRefreshToken(userId, null);
    const oldAccess = signAccessToken(userId, null);
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const expected = { userId, familyId, sessionExpiresAt };
    await registerIssuedTokens(oldAccess, oldRefresh, userId, familyId, sessionExpiresAt);

    const successors = Array.from({ length: 2 }, () => ({
      access: signAccessToken(userId, null),
      refresh: signRefreshToken(userId, null, 60),
    }));
    const results = await Promise.all(
      successors.map(({ access, refresh }) =>
        rotateSessionTokens(verifyRefreshToken(oldRefresh).jti, expected, 60, access, refresh),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await redis.exists(`session:${verifyRefreshToken(oldRefresh).jti}`)).toBe(0);
    expect(await redis.exists(`blacklist:jti:${verifyRefreshToken(oldRefresh).jti}`)).toBe(1);
    for (const [index, successor] of successors.entries()) {
      const payload = verifyRefreshToken(successor.refresh);
      expect(await redis.exists(`session:${payload.jti}`)).toBe(results[index] ? 1 : 0);
      if (results[index]) {
        const accessKey = `access-session:${verifyAccessToken(successor.access).jti}`;
        expect(await redis.ttl(`user-sessions:${userId}`)).toBeGreaterThanOrEqual(
          await redis.ttl(accessKey),
        );
      }
    }
  });

  it('leaves no live unindexed successor when revocation races rotation', async () => {
    const userId = randomUUID();
    const familyId = randomUUID();
    const oldRefresh = signRefreshToken(userId, null);
    const oldAccess = signAccessToken(userId, null);
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const expected = { userId, familyId, sessionExpiresAt };
    await registerIssuedTokens(oldAccess, oldRefresh, userId, familyId, sessionExpiresAt);
    const access = signAccessToken(userId, null);
    const refresh = signRefreshToken(userId, null);

    await Promise.all([
      rotateSessionTokens(verifyRefreshToken(oldRefresh).jti, expected, 60, access, refresh),
      revokeAllUserSessions(userId),
    ]);

    expect(await redis.exists(`user-sessions:${userId}`)).toBe(0);
    expect(await redis.exists(`access-session:${verifyAccessToken(access).jti}`)).toBe(0);
    expect(await redis.exists(`session:${verifyRefreshToken(refresh).jti}`)).toBe(0);
  });

  it('keeps a partially written successor indexed and revocable after a Redis script error', async () => {
    const userId = randomUUID();
    const familyId = randomUUID();
    const oldRefresh = signRefreshToken(userId, null);
    const oldAccess = signAccessToken(userId, null);
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    await registerIssuedTokens(oldAccess, oldRefresh, userId, familyId, sessionExpiresAt);
    const access = signAccessToken(userId, null);
    const refresh = signRefreshToken(userId, null);
    const accessKey = `access-session:${verifyAccessToken(access).jti}`;
    const refreshKey = `session:${verifyRefreshToken(refresh).jti}`;
    const originalEval = redis.eval.bind(redis);
    const evalSpy = vi.spyOn(redis, 'eval').mockImplementationOnce((script, numberOfKeys, ...args) =>
      originalEval(
        script.replace(
          "redis.call('SET', KEYS[4], ARGV[7], 'EX', ARGV[5])",
          "redis.call('SET', KEYS[4], ARGV[7], 'EX', ARGV[5])\nredis.call('TASKFLOW_INJECTED_FAILURE')",
        ),
        numberOfKeys,
        ...args,
      ),
    );

    try {
      await expect(
        rotateSessionTokens(
          verifyRefreshToken(oldRefresh).jti,
          { userId, familyId, sessionExpiresAt },
          60,
          access,
          refresh,
        ),
      ).rejects.toThrow();
    } finally {
      evalSpy.mockRestore();
    }

    expect(await redis.exists(`session:${verifyRefreshToken(oldRefresh).jti}`)).toBe(0);
    expect(await redis.exists(`blacklist:jti:${verifyRefreshToken(oldRefresh).jti}`)).toBe(1);
    expect(await redis.exists(accessKey)).toBe(1);
    expect(await redis.exists(refreshKey)).toBe(0);
    expect(await redis.sismember(`user-sessions:${userId}`, accessKey)).toBe(1);
    expect(await redis.sismember(`user-sessions:${userId}`, refreshKey)).toBe(1);

    await revokeAllUserSessions(userId);
    expect(await redis.exists(accessKey)).toBe(0);
    expect(await redis.exists(refreshKey)).toBe(0);
    expect(await redis.exists(`user-sessions:${userId}`)).toBe(0);
  });

  it('caps Redis session TTL at the earlier refresh expiry or absolute deadline', async () => {
    const refreshShortUser = randomUUID();
    const refreshShortAccess = signAccessToken(refreshShortUser, null);
    const refreshShortToken = signRefreshToken(refreshShortUser, null, 60);
    const refreshShortDeadline = Math.floor(Date.now() / 1000) + 60 * 60;

    await registerIssuedTokens(
      refreshShortAccess,
      refreshShortToken,
      refreshShortUser,
      randomUUID(),
      refreshShortDeadline,
    );

    const refreshShortJti = verifyRefreshToken(refreshShortToken).jti;
    expect(await redis.ttl(`session:${refreshShortJti}`)).toBeLessThanOrEqual(60);
    expect(await redis.ttl(`user-sessions:${refreshShortUser}`)).toBeLessThanOrEqual(60);

    const deadlineShortUser = randomUUID();
    const deadlineShortAccess = signAccessToken(deadlineShortUser, null);
    const deadlineShortToken = signRefreshToken(deadlineShortUser, null, 60 * 60);
    const deadlineShortDeadline = Math.floor(Date.now() / 1000) + 60;

    await registerIssuedTokens(
      deadlineShortAccess,
      deadlineShortToken,
      deadlineShortUser,
      randomUUID(),
      deadlineShortDeadline,
    );

    const deadlineShortJti = verifyRefreshToken(deadlineShortToken).jti;
    expect(await redis.ttl(`session:${deadlineShortJti}`)).toBeLessThanOrEqual(60);
    expect(await redis.ttl(`user-sessions:${deadlineShortUser}`)).toBeLessThanOrEqual(60);
  });
});
