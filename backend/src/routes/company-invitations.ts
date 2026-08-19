import { Router } from 'express';
import { z } from 'zod';
import { parseQuery } from '../http/parseQuery';
import { runTenantRequest } from '../http/runTenantRequest';
import { runUserRequest } from '../http/runUserRequest';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { authenticatedReadLimiter, writeLimiter } from '../middleware/rateLimitProfiles';
import { validateBody } from '../middleware/validate';
import { addCompanyInvitationSchema } from '../schemas/company-invitations.schema';
import * as companyInvitationsService from '../services/company-invitations.service';

const listCompanyInvitationsQuerySchema = z.object({ status: z.literal('pending') }).strict();

export const companyInvitationsRouter = Router();

companyInvitationsRouter.post(
  '/company/invitations',
  requireAuth,
  writeLimiter,
  requireRole(['companyAdmin']),
  validateBody(addCompanyInvitationSchema),
  async (req, res, next) => {
    try {
      const invitation = await runTenantRequest(req, (db, actor) =>
        companyInvitationsService.createInvitation(db, actor, req.body),
      );
      res.status(201).json(invitation);
    } catch (error) {
      next(error);
    }
  },
);

companyInvitationsRouter.get(
  '/company/invitations',
  requireAuth,
  authenticatedReadLimiter,
  requireRole(['companyAdmin']),
  async (req, res, next) => {
    try {
      parseQuery(listCompanyInvitationsQuerySchema, req.query);
      const invitations = await runTenantRequest(req, (db, actor) =>
        companyInvitationsService.listCompanyInvitations(db, actor),
      );
      res.json(invitations);
    } catch (error) {
      next(error);
    }
  },
);

companyInvitationsRouter.delete(
  '/company/invitations/:id',
  requireAuth,
  writeLimiter,
  requireRole(['companyAdmin']),
  async (req, res, next) => {
    try {
      const invitation = await runTenantRequest(req, (db, actor) =>
        companyInvitationsService.cancelInvitation(db, actor, req.params.id),
      );
      res.json(invitation);
    } catch (error) {
      next(error);
    }
  },
);

companyInvitationsRouter.get(
  '/users/me/company-invitations',
  requireAuth,
  authenticatedReadLimiter,
  async (req, res, next) => {
    try {
      const invitations = await runUserRequest(req, (db, actor) =>
        companyInvitationsService.listMyInvitations(db, actor),
      );
      res.json({ invitations, pendingCount: invitations.length });
    } catch (error) {
      next(error);
    }
  },
);

companyInvitationsRouter.post(
  '/users/me/company-invitations/:id/accept',
  requireAuth,
  writeLimiter,
  async (req, res, next) => {
    try {
      const result = await runUserRequest(req, (db, actor) =>
        companyInvitationsService.acceptInvitation(db, actor, req.params.id),
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

companyInvitationsRouter.post(
  '/users/me/company-invitations/:id/reject',
  requireAuth,
  writeLimiter,
  async (req, res, next) => {
    try {
      const invitation = await runUserRequest(req, (db, actor) =>
        companyInvitationsService.rejectInvitation(db, actor, req.params.id),
      );
      res.json(invitation);
    } catch (error) {
      next(error);
    }
  },
);
