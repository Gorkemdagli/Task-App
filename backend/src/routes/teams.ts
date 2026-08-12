import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validateBody } from '../middleware/validate';
import { createRateLimit } from '../middleware/rateLimit';
import {
  createTeamSchema,
  addMemberSchema,
  updateTeamMemberRoleSchema,
} from '../schemas/teams.schema';
import * as teamsService from '../services/teams.service';
import { runTenantRequest } from '../http/runTenantRequest';

export const teamsRouter = Router();

const createLimiter = createRateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'rl:teams-create',
});
const memberWriteLimiter = createRateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'rl:teams-members',
});
const memberRoleLimiter = createRateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'rl:teams-member-role',
});

teamsRouter.use(requireAuth);

teamsRouter.post(
  '/',
  createLimiter,
  requireRole(['companyAdmin']),
  validateBody(createTeamSchema),
  async (req, res, next) => {
    try {
      const team = await runTenantRequest(req, (db, actor) =>
        teamsService.createTeam(db, req.body, actor),
      );
      res.status(201).json(team);
    } catch (e) {
      next(e);
    }
  },
);

teamsRouter.get('/', async (req, res, next) => {
  try {
    const teams = await runTenantRequest(req, (db, actor) => teamsService.listTeams(db, actor));
    res.json(teams);
  } catch (e) {
    next(e);
  }
});

teamsRouter.get('/:id', async (req, res, next) => {
  try {
    const team = await runTenantRequest(req, (db, actor) =>
      teamsService.getTeam(db, req.params.id, actor),
    );
    res.json(team);
  } catch (e) {
    next(e);
  }
});

teamsRouter.post(
  '/:id/members',
  memberWriteLimiter,
  validateBody(addMemberSchema),
  async (req, res, next) => {
    try {
      const member = await runTenantRequest(req, (db, actor) =>
        teamsService.addMemberByDisplayId(db, req.params.id, req.body.displayId, actor),
      );
      res.status(201).json(member);
    } catch (e) {
      next(e);
    }
  },
);

teamsRouter.delete('/:id/members/:userId', memberWriteLimiter, async (req, res, next) => {
  try {
    await runTenantRequest(req, (db, actor) =>
      teamsService.removeMember(db, req.params.id, req.params.userId, actor),
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

teamsRouter.patch(
  '/:id/members/:userId/role',
  memberRoleLimiter,
  validateBody(updateTeamMemberRoleSchema),
  async (req, res, next) => {
    try {
      const member = await runTenantRequest(req, (db, actor) =>
        teamsService.updateTeamMemberRole(db, req.params.id, req.params.userId, req.body, actor),
      );
      res.json(member);
    } catch (error) {
      next(error);
    }
  },
);
