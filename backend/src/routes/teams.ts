import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validateBody } from '../middleware/validate';
import { createRateLimit } from '../middleware/rateLimit';
import { createTeamSchema, addMemberSchema } from '../schemas/teams.schema';
import * as teamsService from '../services/teams.service';

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

teamsRouter.use(requireAuth);

teamsRouter.post(
  '/',
  createLimiter,
  requireRole(['companyAdmin']),
  validateBody(createTeamSchema),
  async (req, res, next) => {
    try {
      const team = await teamsService.createTeam(req.body, req.user!);
      res.status(201).json(team);
    } catch (e) {
      next(e);
    }
  },
);

teamsRouter.get('/', async (req, res, next) => {
  try {
    const teams = await teamsService.listTeams(req.user!);
    res.json(teams);
  } catch (e) {
    next(e);
  }
});

teamsRouter.get('/:id', async (req, res, next) => {
  try {
    const team = await teamsService.getTeam(req.params.id, req.user!);
    res.json(team);
  } catch (e) {
    next(e);
  }
});

teamsRouter.post(
  '/:id/members',
  memberWriteLimiter,
  requireRole(['companyAdmin']),
  validateBody(addMemberSchema),
  async (req, res, next) => {
    try {
      const member = await teamsService.addMemberByDisplayId(
        req.params.id,
        req.body.displayId,
        req.user!,
      );
      res.status(201).json(member);
    } catch (e) {
      next(e);
    }
  },
);

teamsRouter.delete(
  '/:id/members/:userId',
  memberWriteLimiter,
  requireRole(['companyAdmin']),
  async (req, res, next) => {
    try {
      await teamsService.removeMember(req.params.id, req.params.userId, req.user!);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);
