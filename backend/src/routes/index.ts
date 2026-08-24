import { Router } from 'express';
import { healthRouter } from './health';
import { readyRouter } from './ready';
import { internalRouter } from './internal';
import { authRouter } from './auth';
import { teamsRouter } from './teams';
import { tasksRouter } from './tasks';
import { commentsRouter } from './comments';
import { adminRouter } from './admin';
import { notificationsRouter } from './notifications';
import { usersRouter } from './users';
import { companyInvitationsRouter } from './company-invitations';
import { companyDashboardRouter } from './company-dashboard';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/ready', readyRouter);
apiRouter.use('/internal', internalRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/teams', teamsRouter);
apiRouter.use('/tasks', tasksRouter);
apiRouter.use('/tasks/:taskId/comments', commentsRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use(companyInvitationsRouter);
apiRouter.use('/company/dashboard', companyDashboardRouter);
apiRouter.use(usersRouter);
