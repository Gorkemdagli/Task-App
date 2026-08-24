import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createQstashSignatureMiddleware } from './qstashSignature';

function response() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('QStash signature middleware', () => {
  it('rejects missing signature before next or downstream work', async () => {
    const receiver = { verify: vi.fn() };
    const next = vi.fn() as NextFunction;
    const res = response();

    await createQstashSignatureMiddleware({
      receiver,
      publicUrl: 'https://api.example.test/api/v1/internal/archive',
    })({ headers: {}, rawBody: Buffer.from('{}') } as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(receiver.verify).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid or expired signatures before next', async () => {
    const receiver = { verify: vi.fn().mockRejectedValue(new Error('expired')) };
    const next = vi.fn() as NextFunction;
    const res = response();

    await createQstashSignatureMiddleware({
      receiver,
      publicUrl: 'https://api.example.test/api/v1/internal/archive',
    })(
      {
        headers: { 'upstash-signature': 'invalid' },
        rawBody: Buffer.from('{"run":true}'),
      } as Request,
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('verifies exact configured URL and raw body with current or next key', async () => {
    const receiver = { verify: vi.fn().mockResolvedValue(true) };
    const next = vi.fn() as NextFunction;
    const res = response();
    const rawBody = '{"run":true}';

    await createQstashSignatureMiddleware({
      receiver,
      publicUrl: 'https://api.example.test/api/v1/internal/archive',
    })(
      {
        headers: { 'Upstash-Signature': 'valid' },
        rawBody: Buffer.from(rawBody),
      } as Request,
      res,
      next,
    );

    expect(receiver.verify).toHaveBeenCalledWith({
      signature: 'valid',
      body: rawBody,
      url: 'https://api.example.test/api/v1/internal/archive',
    });
    expect(next).toHaveBeenCalledOnce();
  });
});
