export type PasswordStrength = 'weak' | 'medium' | 'strong';
export function getPasswordStrength(pw: string): PasswordStrength | null {
  if (pw.length < 8) return null;
  const hasNum = /\d/.test(pw);
  const hasUp = /[A-Z]/.test(pw);
  if (pw.length >= 12 && hasNum && hasUp) return 'strong';
  if (hasNum) return 'medium';
  return 'weak';
}
