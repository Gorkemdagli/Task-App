import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { isTokenBlacklisted } from '../services/auth.service';
import { AppError } from './errorHandler';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        displayId: string;
        email: string;
        fullName: string;
        role: 'companyAdmin' | 'member';
        tenantId: string | null;
        tenantName: string | null;
      };
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
    const token = header.slice(7).trim();
    if (!token) throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
    let p;
    try {
      p = verifyAccessToken(token);
    } catch {
      throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
    }
    if (await isTokenBlacklisted(p.jti))
      throw new AppError(401, 'Oturum sonlandırılmış', 'TOKEN_REVOKED');
    const user = await prisma.user.findUnique({
      where: { id: p.sub },
      select: {
        id: true,
        displayId: true,
        email: true,
        fullName: true,
        role: true,
        tenantId: true,
        tenant: { select: { name: true } },
      },
    });
    if (!user) throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
    req.user = {
      id: user.id,
      displayId: user.displayId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
    };
    next();
  } catch (err) {
    next(err);
  }
}
