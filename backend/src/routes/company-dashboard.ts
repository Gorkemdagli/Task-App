import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { parseQuery } from '../http/parseQuery';
import { runTenantRequest } from '../http/runTenantRequest';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { authenticatedReadLimiter } from '../middleware/rateLimitProfiles';
import {
  companyDashboardQuerySchema,
  type CompanyDashboardQuery,
} from '../schemas/company-dashboard.schema';
import { getCompanyDashboard } from '../services/company-dashboard.service';

export const companyDashboardRouter = Router();

companyDashboardRouter.use(requireAuth);
companyDashboardRouter.use(authenticatedReadLimiter);
companyDashboardRouter.use(requireRole(['companyAdmin']));

companyDashboardRouter.get('/', async (req, res, next) => {
  try {
    const query = parseQuery<CompanyDashboardQuery>(companyDashboardQuerySchema, req.query);
    const dashboard = await runTenantRequest(
      req,
      (db, actor) => getCompanyDashboard(db, actor, query),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});
