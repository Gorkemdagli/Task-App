import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validateBody } from '../middleware/validate';
import { createRateLimit } from '../middleware/rateLimit';
import { authenticatedReadLimiter } from '../middleware/rateLimitProfiles';
import { runTenantRequest } from '../http/runTenantRequest';
import { updateCompanyPermissionsSchema, updateCompanyRoleSchema } from '../schemas/users.schema';
import * as companyUsersService from '../services/company-users.service';

export const usersRouter = Router();

usersRouter.get('/users/me', requireAuth, authenticatedReadLimiter, (req, res) => {
  res.json(req.user!);
});

const companyUsersLimiter = createRateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'rl:company-users',
});

usersRouter.use(requireAuth, requireRole(['companyAdmin']));

usersRouter.get('/company/users', companyUsersLimiter, async (req, res, next) => {
  try {
    const users = await runTenantRequest(req, (db, actor) =>
      companyUsersService.listCompanyUsers(db, actor),
    );
    res.json(users);
  } catch (error) {
    next(error);
  }
});

usersRouter.patch(
  '/users/:id/role',
  companyUsersLimiter,
  validateBody(updateCompanyRoleSchema),
  async (req, res, next) => {
    try {
      const user = await runTenantRequest(req, (db, actor) =>
        companyUsersService.updateCompanyRole(db, req.params.id, req.body, actor),
      );
      res.json(user);
    } catch (error) {
      next(error);
    }
  },
);

usersRouter.patch(
  '/users/:id/permissions',
  companyUsersLimiter,
  validateBody(updateCompanyPermissionsSchema),
  async (req, res, next) => {
    try {
      const user = await runTenantRequest(req, (db, actor) =>
        companyUsersService.updateCompanyPermissions(db, req.params.id, req.body, actor),
      );
      res.json(user);
    } catch (error) {
      next(error);
    }
  },
);
