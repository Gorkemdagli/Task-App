import { z } from 'zod';
import { DISPLAY_ID_REGEX } from '../lib/displayId';

export const updateCurrentUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().email().max(255).optional(),
    currentPassword: z.string().min(1).max(72).optional(),
    newPassword: z.string().min(8).max(72).optional(),
    notifyTaskAssigned: z.boolean().optional(),
    notifyTaskCommented: z.boolean().optional(),
    notifyMessageReceived: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const hasMutation = [
      input.fullName,
      input.email,
      input.newPassword,
      input.notifyTaskAssigned,
      input.notifyTaskCommented,
      input.notifyMessageReceived,
    ].some((value) => value !== undefined);

    if (!hasMutation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one profile field is required',
      });
    }

    if ((input.email !== undefined || input.newPassword !== undefined) && !input.currentPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentPassword'],
        message: 'Current password is required for credential changes',
      });
    }
  });

export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserSchema>;

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

export const updateCompanySettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;

export const addCompanyUserSchema = z
  .object({ displayId: z.string().trim().toUpperCase().regex(DISPLAY_ID_REGEX) })
  .strict();

export type AddCompanyUserInput = z.infer<typeof addCompanyUserSchema>;
