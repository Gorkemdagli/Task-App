import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { hashPassword, verifyPassword } from '../lib/password';
import { generateDisplayId } from '../lib/displayId';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
} from '../lib/jwt';
import { companyNameKey, slugify } from './tenant.service';
import { AppError } from '../middleware/errorHandler';
import type { RegisterInput, LoginInput } from '../schemas/auth.schema';
import {
  accessSessionKey,
  refreshSessionKey,
  registerIssuedTokens,
  removeSessionKeys,
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
}

async function findUniqueDisplayId(): Promise<string> {
  for (let i = 0; i < DISPLAY_ID_RETRIES; i++) {
    const c = generateDisplayId();
    if (!(await prisma.user.findUnique({ where: { displayId: c } }))) return c;
  }
  throw new AppError(500, 'displayId üretilemedi', 'INTERNAL');
}

function issueTokens(user: AuthUser): AuthResult {
  return {
    user,
    accessToken: signAccessToken(user.id, user.tenantId),
    refreshToken: signRefreshToken(user.id, user.tenantId),
  };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    throw new AppError(409, 'Bu e-posta zaten kullanılıyor', 'CONFLICT_EMAIL');
  }
  // companyName verilmişse yeni tenant oluştur, user companyAdmin olur.
  // Verilmemişse tenantless user (NULL) — henüz bir şirkette değil.
  // Admin bu user'ı takıma eklerken tenantId otomatik olarak admin'in
  // tenant'ına transfer olur (services/teams.service.addMemberByDisplayId).
  let tenantId: string | null = null;
  if (input.companyName) {
    const slug = slugify(input.companyName);
    const nameKey = companyNameKey(input.companyName);
    if (await prisma.tenant.findUnique({ where: { nameKey } })) {
      throw new AppError(409, 'Bu şirket adı alınmış', 'CONFLICT_SLUG');
    }
    try {
      tenantId = (await prisma.tenant.create({ data: { name: input.companyName, slug, nameKey } }))
        .id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'Bu şirket adı alınmış', 'CONFLICT_SLUG');
      }
      throw error;
    }
  }
  const displayId = await findUniqueDisplayId();
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      tenantId,
      email: input.email,
      fullName: input.fullName,
      displayId,
      passwordHash,
      role: input.companyName ? 'companyAdmin' : 'member',
    },
  });
  const r = issueTokens({
    id: user.id,
    displayId: user.displayId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    tenantId: user.tenantId,
  });
  await registerIssuedTokens(r.accessToken, r.refreshToken, user.id);
  return r;
}

const DUMMY_HASH = '$2b$12$0000000000000000000000000000000000000000000000000000000';

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { tenant: { select: { name: true } } },
  });
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await verifyPassword(input.password, hash);
  if (!user || !valid) throw new AppError(401, 'E-posta veya şifre hatalı', 'UNAUTHORIZED');
  const r = issueTokens({
    id: user.id,
    displayId: user.displayId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    tenantId: user.tenantId,
    tenantName: user.tenant?.name ?? null,
  });
  await registerIssuedTokens(r.accessToken, r.refreshToken, user.id);
  return r;
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
  const sessionJson = await redis.get(refreshSessionKey(p.jti));
  if (!sessionJson) throw new AppError(401, 'Oturum sonlandırılmış', 'TOKEN_REVOKED');
  const { userId, familyId } = JSON.parse(sessionJson) as { userId: string; familyId: string };
  // tenant join → response'da tenantName döner; Sidebar/MobileSidebar tenant adını gösterir.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: { select: { name: true } } },
  });
  if (!user) throw new AppError(401, 'Kullanıcı bulunamadı', 'UNAUTHORIZED');
  const ttl = p.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) await redis.set(BLACKLIST_KEY(p.jti), '1', 'EX', ttl);
  await removeSessionKeys(userId, [refreshSessionKey(p.jti)]);
  const accessToken = signAccessToken(user.id, user.tenantId);
  const newRefreshToken = signRefreshToken(user.id, user.tenantId);
  await registerIssuedTokens(accessToken, newRefreshToken, user.id, familyId);
  return {
    user: {
      id: user.id,
      displayId: user.displayId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
    },
    accessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logout(accessToken: string, refreshToken?: string): Promise<void> {
  const p = verifyAccessToken(accessToken);
  const ttl = p.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) await redis.set(BLACKLIST_KEY(p.jti), '1', 'EX', ttl);
  const keys = [accessSessionKey(p.jti)];
  if (refreshToken) {
    try {
      const rp = verifyRefreshToken(refreshToken);
      if (rp.sub === p.sub) keys.push(refreshSessionKey(rp.jti));
    } catch {
      // refresh token invalid/expired — ignore
    }
  }
  await removeSessionKeys(p.sub, keys);
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  return (await redis.exists(BLACKLIST_KEY(jti))) === 1;
}
