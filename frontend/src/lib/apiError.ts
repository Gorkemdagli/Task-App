import i18n from '@/i18n';

const knownApiMessages = new Set([
  'E-posta veya şifre hatalı',
  'Bu e-posta zaten kullanılıyor',
  'Bu e-posta zaten kullanılıyor.',
]);

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data
    ?.message;
  if (typeof message === 'string') {
    return knownApiMessages.has(message) ? i18n.t(message) : message;
  }
  return i18n.t(fallback);
}
