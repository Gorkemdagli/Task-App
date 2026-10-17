import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { hashPassword, verifyPassword } from '../lib/password';
import { generateDisplayId } from '../lib/displayId';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
  AUTH_SESSION_MAX_TTL_SECONDS,
  REFRESH_TOKEN_IDLE_TTL_SECONDS,
} from '../lib/jwt';
import { companyNameKey, slugify } from './tenant.service';
import { AppError } from '../lib/appError';
import { withTenantContext } from '../db/withTenant';
import { withUserContext } from '../db/withUser';
import type { RegisterInput, LoginInput } from '../schemas/auth.schema';
import { measureRequestStage, type RequestTimingRecorder } from '../http/requestTiming';
import {
  accessSessionKey,
  refreshSessionKey,
  registerIssuedTokens,
  removeSessionKeys,
  getRefreshSession,
  rotateSessionTokens,
} from '../lib/sessionStore';

const DISPLAY_ID_RETRIES = 5;
const BLACKLIST_KEY = (jti: string) => `blacklist:jti:${jti}`;

export interface AuthUser {
  id: string;
  displayId: string;
  email: string;
  fullName: string;
  role: 'companyAdmin' | 'member';
  tenantId: string | null;
  tenantName?: string | null;
}
export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: number;
  sessionExpiresAt: number;
}

function issueTokens(user: AuthUser): AuthResult {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionExpiresAt = nowSeconds + AUTH_SESSION_MAX_TTL_SECONDS;
  const refreshLifetimeSeconds = Math.min(
    REFRESH_TOKEN_IDLE_TTL_SECONDS,
    sessionExpiresAt - nowSeconds,
  );
  const refreshToken = signRefreshToken(user.id, user.tenantId, refreshLifetimeSeconds);

  return {
    user,
    accessToken: signAccessToken(user.id, user.tenantId),
    refreshToken,
    refreshExpiresAt: verifyRefreshToken(refreshToken).exp,
    sessionExpiresAt,
  };
}

function isUniqueConstraint(error: unknown, column: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  const adapterCause = error.meta?.driverAdapterError as
    | { cause?: { constraint?: unknown } }
    | undefined;
  const constraint = adapterCause?.cause?.constraint;
  return [target, constraint, error.message].some((value) =>
    Array.isArray(value)
      ? value.some((item) => typeof item === 'string' && item.includes(column))
      : typeof value === 'string' && value.includes(column),
  );
}

async function findUserById(userId: string) {
  return withUserContext(userId, (tx) => tx.user.findUnique({ where: { id: userId } }));
}

async function findTenantName(userId: string, tenantId: string | null): Promise<string | null> {
  if (!tenantId) return null;
  const tenant = await withTenantContext(userId, tenantId, (tx) =>
    tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  );
  return tenant?.name ?? null;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string | null }>>`
    SELECT private.auth_user_id_by_email(${email}) AS id
  `;
  return rows[0]?.id ?? null;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const userId = randomUUID();
  const company = input.companyName
    ? {
        id: randomUUID(),
        slug: slugify(input.companyName),
        nameKey: companyNameKey(input.companyName),
        name: input.companyName,
      }
    : null;
  const passwordHash = await hashPassword(input.password);
  const data = {
    id: userId,
    tenantId: company?.id ?? null,
    email: input.email,
    fullName: input.fullName,
    passwordHash,
    role: company ? ('companyAdmin' as const) : ('member' as const),
  };

  let user;
  for (let attempt = 0; attempt < DISPLAY_ID_RETRIES; attempt++) {
    try {
      const displayId = generateDisplayId();
      user = company
        ? await withTenantContext(userId, company.id, async (tx) => {
            await tx.tenant.create({ data: company });
            return tx.user.create({ data: { ...data, displayId } });
          })
        : await withUserContext(userId, (tx) => tx.user.create({ data: { ...data, displayId } }));
      break;
    } catch (error) {
      if (isUniqueConstraint(error, 'display_id')) continue;
      if (isUniqueConstraint(error, 'email')) {
        throw new AppError(409, 'Bu e-posta zaten kullanılıyor', 'CONFLICT_EMAIL');
      }
      if (isUniqueConstraint(error, 'slug') || isUniqueConstraint(error, 'name_key')) {
        throw new AppError(409, 'Bu şirket adı alınmış', 'CONFLICT_SLUG');
      }
      throw error;
    }
  }

  if (!user) throw new AppError(500, 'displayId üretilemedi', 'INTERNAL');
  const result = issueTokens({
    id: user.id,
    displayId: user.displayId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    tenantId: user.tenantId,
  });
  await registerIssuedTokens(
    result.accessToken,
    result.refreshToken,
    user.id,
    randomUUID(),
    result.sessionExpiresAt,
  );
  return result;
}

const DUMMY_HASH = '$2b$12$0000000000000000000000000000000000000000000000000000000';

export async function login(
  input: LoginInput,
  timing?: RequestTimingRecorder,
): Promise<AuthResult> {
  const user = await measureRequestStage(timing, 'auth_db_ms', async () => {
    const userId = await findUserIdByEmail(input.email);
    return userId ? findUserById(userId) : null;
  });
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await measureRequestStage(timing, 'password_verify_ms', () =>
    verifyPassword(input.password, hash),
  );
  if (!user || !valid) throw new AppError(401, 'E-posta veya şifre hatalı', 'UNAUTHORIZED');
  const tenantName = await measureRequestStage(timing, 'auth_db_ms', () =>
    findTenantName(user.id, user.tenantId),
  );
  const result = issueTokens({
    id: user.id,
    displayId: user.displayId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    tenantId: user.tenantId,
    tenantName,
  });
  await measureRequestStage(timing, 'session_redis_ms', () =>
    registerIssuedTokens(
      result.accessToken,
      result.refreshToken,
      user.id,
      randomUUID(),
      result.sessionExpiresAt,
    ),
  );
  return result;
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  let p;
  try {
    p = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
  }
  if (await isTokenBlacklisted(p.jti))
    throw new AppError(401, 'Oturum sonlandırılmış', 'TOKEN_REVOKED');
  const session = await getRefreshSession(p.jti);
  if (!session) throw new AppError(401, 'Oturum sonlandırılmış', 'TOKEN_REVOKED');
  const { userId, sessionExpiresAt } = session;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (sessionExpiresAt <= nowSeconds) {
    throw new AppError(401, 'Oturum süresi doldu', 'SESSION_EXPIRED');
  }
  const user = await findUserById(userId);
  if (!user) throw new AppError(401, 'Kullanıcı bulunamadı', 'UNAUTHORIZED');
  const tenantName = await findTenantName(user.id, user.tenantId);
  const accessToken = signAccessToken(user.id, user.tenantId);
  const refreshLifetimeSeconds = Math.min(
    REFRESH_TOKEN_IDLE_TTL_SECONDS,
    sessionExpiresAt - nowSeconds,
  );
  const newRefreshToken = signRefreshToken(user.id, user.tenantId, refreshLifetimeSeconds);
  const refreshExpiresAt = verifyRefreshToken(newRefreshToken).exp;
  const rotated = await rotateSessionTokens(
    p.jti,
    session,
    Math.min(p.exp, sessionExpiresAt) - nowSeconds,
    accessToken,
    newRefreshToken,
  );
  if (!rotated) throw new AppError(401, 'Oturum sonlandÄ±rÄ±lmÄ±Å¸', 'TOKEN_REVOKED');
  return {
    user: {
      id: user.id,
      displayId: user.displayId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      tenantName,
    },
    accessToken,
    refreshToken: newRefreshToken,
    refreshExpiresAt,
    sessionExpiresAt,
  };
}

export async function logout(accessToken?: string, refreshToken?: string): Promise<void> {
  let accessPayload: ReturnType<typeof verifyAccessToken> | undefined;
  let refreshPayload: ReturnType<typeof verifyRefreshToken> | undefined;

  if (accessToken) {
    try {
      accessPayload = verifyAccessToken(accessToken);
    } catch {
      // An expired or already-revoked access token should not prevent logout.
    }
  }

  if (refreshToken) {
    try {
      refreshPayload = verifyRefreshToken(refreshToken);
    } catch {
      // An expired refresh token has nothing left to revoke.
    }
  }

  if (accessPayload) {
    const ttl = accessPayload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) await redis.set(BLACKLIST_KEY(accessPayload.jti), '1', 'EX', ttl);
  }

  const userId = accessPayload?.sub ?? refreshPayload?.sub;
  if (!userId) return;

  const keys = accessPayload ? [accessSessionKey(accessPayload.jti)] : [];
  if (refreshPayload && (!accessPayload || refreshPayload.sub === accessPayload.sub)) {
    keys.push(refreshSessionKey(refreshPayload.jti));
  }
  await removeSessionKeys(userId, keys);
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  return (await redis.exists(BLACKLIST_KEY(jti))) === 1;
}
