import { z } from 'zod';

export const companyDashboardQuerySchema = z
  .object({
    teamId: z.string().uuid().optional(),
    range: z.enum(['7d', '30d', '90d']).optional(),
  })
  .strict();

export type CompanyDashboardQuery = z.infer<typeof companyDashboardQuerySchema>;

export const teamDashboardQuerySchema = z
  .object({ range: z.enum(['7d', '30d', '90d']).optional() })
  .strict();

export type TeamDashboardQuery = z.infer<typeof teamDashboardQuerySchema>;

export const teamDashboardParamsSchema = z.object({ id: z.string().uuid() }).strict();

export type TeamDashboardParams = z.infer<typeof teamDashboardParamsSchema>;
