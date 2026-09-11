import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validateBody } from '../middleware/validate';
import { authenticatedReadLimiter, writeLimiter } from '../middleware/rateLimitProfiles';
import { parseQuery } from '../http/parseQuery';
import {
  createTeamSchema,
  addMemberSchema,
  searchMemberCandidatesQuerySchema,
  updateTeamMemberRoleSchema,
} from '../schemas/teams.schema';
import * as teamsService from '../services/teams.service';
import { runTenantRequest } from '../http/runTenantRequest';

export const teamsRouter = Router();

teamsRouter.use(requireAuth);

teamsRouter.post(
  '/',
  writeLimiter,
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

teamsRouter.get('/', authenticatedReadLimiter, async (req, res, next) => {
  try {
    const teams = await runTenantRequest(req, (db, actor) => teamsService.listTeams(db, actor));
    res.json(teams);
  } catch (e) {
    next(e);
  }
});

teamsRouter.get('/:id/member-candidates', authenticatedReadLimiter, async (req, res, next) => {
  try {
    const query = parseQuery<{ q: string }>(searchMemberCandidatesQuerySchema, req.query);
    const candidates = await runTenantRequest(req, (db, actor) =>
      teamsService.searchMemberCandidates(db, (req.params as { id: string }).id, query.q, actor),
    );
    res.json(candidates);
  } catch (e) {
    next(e);
  }
});

teamsRouter.get('/:id', authenticatedReadLimiter, async (req, res, next) => {
  try {
    const team = await runTenantRequest(req, (db, actor) =>
      teamsService.getTeam(db, (req.params as { id: string }).id, actor),
    );
    res.json(team);
  } catch (e) {
    next(e);
  }
});

teamsRouter.post(
  '/:id/members',
  writeLimiter,
  validateBody(addMemberSchema),
  async (req, res, next) => {
    try {
      const member = await runTenantRequest(req, (db, actor) =>
        teamsService.addMemberByDisplayId(
          db,
          (req.params as { id: string }).id,
          req.body.displayId,
          actor,
        ),
      );
      res.status(201).json(member);
    } catch (e) {
      next(e);
    }
  },
);

teamsRouter.delete('/:id/members/:userId', writeLimiter, async (req, res, next) => {
  try {
    await runTenantRequest(req, (db, actor) =>
      teamsService.removeMember(
        db,
        (req.params as { id: string; userId: string }).id,
        (req.params as { id: string; userId: string }).userId,
        actor,
      ),
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

teamsRouter.patch(
  '/:id/members/:userId/role',
  writeLimiter,
  validateBody(updateTeamMemberRoleSchema),
  async (req, res, next) => {
    try {
      const member = await runTenantRequest(req, (db, actor) =>
        teamsService.updateTeamMemberRole(
          db,
          (req.params as { id: string; userId: string }).id,
          (req.params as { id: string; userId: string }).userId,
          req.body,
          actor,
        ),
      );
      res.json(member);
    } catch (error) {
      next(error);
    }
  },
);
