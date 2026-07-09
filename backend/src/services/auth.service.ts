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
import { slugify } from './tenant.service';
import { AppError } from '../middleware/errorHandler';
import type { RegisterInput, LoginInput } from '../schemas/auth.schema';

const DISPLAY_ID_RETRIES = 5;
const BLACKLIST_KEY = (jti: string) => `blacklist:jti:${jti}`;

export interface AuthUser {
  id: string;
  displayId: string;
  email: string;
  fullName: string;
  role: 'companyAdmin' | 'teamAdmin' | 'member';
  tenantId: string;
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
  let tenantId: string;
  if (input.companyName) {
    const slug = slugify(input.companyName);
    if (await prisma.tenant.findUnique({ where: { slug } })) {
      throw new AppError(409, 'Bu şirket adı alınmış', 'CONFLICT_SLUG');
    }
    tenantId = (await prisma.tenant.create({ data: { name: input.companyName, slug } })).id;
  } else {
    const slug = slugify(`personal-${input.email.split('@')[0]}-${Date.now()}`);
    tenantId = (await prisma.tenant.create({ data: { name: `${input.fullName} (Kişisel)`, slug } }))
      .id;
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
      role: 'companyAdmin',
    },
  });
  return issueTokens({
    id: user.id,
    displayId: user.displayId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    tenantId: user.tenantId,
  });
}

const DUMMY_HASH = '$2b$12$0000000000000000000000000000000000000000000000000000000';

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await verifyPassword(input.password, hash);
  if (!user || !valid) throw new AppError(401, 'E-posta veya şifre hatalı', 'UNAUTHORIZED');
  return issueTokens({
    id: user.id,
    displayId: user.displayId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    tenantId: user.tenantId,
  });
}

export async function refresh(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  let p;
  try {
    p = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
  }
  if (await isTokenBlacklisted(p.jti))
    throw new AppError(401, 'Oturum sonlandırılmış', 'TOKEN_REVOKED');
  const user = await prisma.user.findUnique({ where: { id: p.sub } });
  if (!user) throw new AppError(401, 'Kullanıcı bulunamadı', 'UNAUTHORIZED');
  const ttl = p.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) await redis.set(BLACKLIST_KEY(p.jti), '1', 'EX', ttl);
  return {
    accessToken: signAccessToken(user.id, user.tenantId),
    refreshToken: signRefreshToken(user.id, user.tenantId),
  };
}

export async function logout(accessToken: string): Promise<void> {
  const p = verifyAccessToken(accessToken);
  const ttl = p.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) await redis.set(BLACKLIST_KEY(p.jti), '1', 'EX', ttl);
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  return (await redis.exists(BLACKLIST_KEY(jti))) === 1;
}
