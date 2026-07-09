import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().min(2, 'En az 2 karakter').max(100),
  email: z.string().email('Geçerli bir e-posta girin').max(255),
  password: z.string().min(8, 'En az 8 karakter').max(72),
  companyName: z.string().min(2).max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
  password: z.string().min(1, 'Şifre gerekli'),
});
export type LoginInput = z.infer<typeof loginSchema>;
