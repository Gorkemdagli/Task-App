import { z } from 'zod';

export const companyDashboardQuerySchema = z
  .object({ teamId: z.string().uuid().optional() })
  .strict();

export type CompanyDashboardQuery = z.infer<typeof companyDashboardQuerySchema>;
