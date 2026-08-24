import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Receiver, type VerifyRequest } from '@upstash/qstash';
import { env } from '../env';

declare global {
  // Express request augmentation requires a namespace declaration.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

interface ReceiverLike {
  verify(request: VerifyRequest): Promise<boolean>;
}

interface QstashSignatureOptions {
  receiver?: ReceiverLike;
  publicUrl?: string;
}

function getSignature(req: Request): string | undefined {
  const header = Object.entries(req.headers).find(
    ([key]) => key.toLowerCase() === 'upstash-signature',
  )?.[1];
  return Array.isArray(header) ? header[0] : header;
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: 'Invalid QStash signature' });
}

export function createQstashSignatureMiddleware(
  options: QstashSignatureOptions = {},
): RequestHandler {
  const receiver =
    options.receiver ??
    new Receiver({
      currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
    });
  const publicUrl =
    options.publicUrl ??
    (env.PUBLIC_API_ORIGIN
      ? `${env.PUBLIC_API_ORIGIN.replace(/\/$/, '')}/api/v1/internal/archive`
      : undefined);

  return async function qstashSignature(req: Request, res: Response, next: NextFunction) {
    const signature = getSignature(req);
    const body = req.rawBody?.toString('utf8');
    if (!signature || body === undefined || !publicUrl) {
      unauthorized(res);
      return;
    }

    try {
      const valid = await receiver.verify({ signature, body, url: publicUrl });
      if (!valid) {
        unauthorized(res);
        return;
      }
      next();
    } catch {
      unauthorized(res);
    }
  };
}

export const qstashSignature = createQstashSignatureMiddleware();
