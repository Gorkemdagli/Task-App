import { z } from 'zod';

export const updateCompanyRoleSchema = z.object({
  role: z.enum(['member', 'companyAdmin']),
});

export type UpdateCompanyRoleInput = z.infer<typeof updateCompanyRoleSchema>;

export const companyTeamRoleSchema = z.object({
  teamId: z.string().uuid(),
  role: z.enum(['member', 'teamAdmin']),
});

export const updateCompanyPermissionsSchema = z
  .object({
    role: z.enum(['member', 'companyAdmin']),
    teamRoles: z.array(companyTeamRoleSchema).max(100),
  })
  .superRefine((input, context) => {
    const teamIds = input.teamRoles.map((teamRole) => teamRole.teamId);
    if (new Set(teamIds).size !== teamIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamRoles'],
        message: 'Aynı takım birden fazla seçilemez',
      });
    }
  });

export type UpdateCompanyPermissionsInput = z.infer<typeof updateCompanyPermissionsSchema>;
