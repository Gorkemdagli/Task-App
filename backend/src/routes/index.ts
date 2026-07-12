import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth';
import { teamsRouter } from './teams';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/teams', teamsRouter);
