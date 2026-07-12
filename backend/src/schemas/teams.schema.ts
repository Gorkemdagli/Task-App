import { z } from 'zod';
import { DISPLAY_ID_REGEX } from '../lib/displayId';

export const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const addMemberSchema = z.object({
  // Hem çıplak 5-karakter (`A3X9K`) hem görsel prefix'li (`TF-A3X9K`) kabul edilir.
  // Prefix kabul edilebilir ama DB'de sadece 5-karakter saklanır.
  displayId: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v.startsWith('TF-') ? v.slice(3) : v))
    .refine((v) => DISPLAY_ID_REGEX.test(v), {
      message: 'Geçersiz kullanıcı kimliği formatı',
    }),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;
