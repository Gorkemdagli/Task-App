import { describe, it, expect } from 'vitest';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt';

describe('jwt', () => {
  const userId = 'user-1';
  const tenantId = 'tenant-1';

  it('signs and verifies access token', () => {
    const token = signAccessToken(userId, tenantId);
    const p = verifyAccessToken(token);
    expect(p.sub).toBe(userId);
    expect(p.tenantId).toBe(tenantId);
    expect(p.type).toBe('access');
    expect(p.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses a 15-minute access token lifetime', () => {
    const token = signAccessToken(userId, tenantId);
    const payload = verifyAccessToken(token);
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it('signs and verifies refresh token', () => {
    const token = signRefreshToken(userId, tenantId);
    expect(verifyRefreshToken(token).type).toBe('refresh');
  });

  it('accepts a bounded refresh lifetime', () => {
    const token = signRefreshToken(userId, tenantId, 3 * 24 * 60 * 60);
    const payload = verifyRefreshToken(token);
    expect(payload.exp - payload.iat).toBe(3 * 24 * 60 * 60);
  });

  it('rejects tampered token', () => {
    const token = signAccessToken(userId, tenantId);
    const bad = token.split('.').slice(0, 2).join('.') + '.invalidsig';
    expect(() => verifyAccessToken(bad)).toThrow();
  });

  it('rejects refresh as access (signature mismatch)', () => {
    const refresh = signRefreshToken(userId, tenantId);
    expect(() => verifyAccessToken(refresh)).toThrow(/invalid signature/i);
  });
});
