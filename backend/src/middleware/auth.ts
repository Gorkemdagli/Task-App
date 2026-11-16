import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { getAccessTokenAuthState } from '../lib/sessionStore';
import { AppError } from '../lib/appError';
import { withUserContext } from '../db/withUser';
import { createTransactionPhaseRecorder, measureRequestStage } from '../http/requestTiming';

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
    const { blacklisted, hasSession } = await measureRequestStage(
      req.requestTiming,
      'session_redis_ms',
      () => getAccessTokenAuthState(p.jti),
    );
    if (blacklisted)
      throw new AppError(401, 'Oturum sonlandırılmış', 'TOKEN_REVOKED');
    if (!hasSession)
      throw new AppError(401, 'Session revoked', 'TOKEN_REVOKED');
    const phaseRecorder = createTransactionPhaseRecorder(req.requestTiming, 'auth');
    const user = await measureRequestStage(req.requestTiming, 'auth_db_ms', () =>
      withUserContext(
        p.sub,
        (tx) =>
          tx.user.findFirst({
            where: { id: p.sub, deletedAt: null },
            select: {
              id: true,
              displayId: true,
              email: true,
              fullName: true,
              role: true,
              tenantId: true,
            },
          }),
        phaseRecorder ? { phaseRecorder } : undefined,
      ),
    );
    if (!user) throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
    req.user = {
      id: user.id,
      displayId: user.displayId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
    };
    next();
  } catch (err) {
    next(err);
  }
}
