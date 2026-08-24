import { Router, type RequestHandler } from 'express';
import { runArchiveBatch } from '../archive-batch';
import { qstashSignature } from '../middleware/qstashSignature';
import { internalDeliveryLimiter } from '../middleware/rateLimitProfiles';

interface InternalRouterDependencies {
  signatureMiddleware: RequestHandler;
  rateLimitMiddleware: RequestHandler;
  runArchiveBatch: typeof runArchiveBatch;
}

export function createInternalRouter(
  dependencies: InternalRouterDependencies = {
    signatureMiddleware: qstashSignature,
    rateLimitMiddleware: internalDeliveryLimiter,
    runArchiveBatch,
  },
) {
  const router = Router();

  router.post(
    '/archive',
    dependencies.signatureMiddleware,
    dependencies.rateLimitMiddleware,
    async (_req, res, next) => {
      try {
        res.json(await dependencies.runArchiveBatch());
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export const internalRouter = createInternalRouter();
