import { z } from 'zod';
import { DISPLAY_ID_REGEX } from '../lib/displayId';

export const addCompanyInvitationSchema = z.union([
  z.object({ displayId: z.string().trim().toUpperCase().regex(DISPLAY_ID_REGEX) }).strict(),
  z
    .object({
      email: z
        .string()
        .trim()
        .email()
        .max(255)
        .transform((value) => value.toLowerCase()),
    })
    .strict(),
]);

export type AddCompanyInvitationInput = z.infer<typeof addCompanyInvitationSchema>;
