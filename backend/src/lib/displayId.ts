import { randomBytes } from 'crypto';
export const DISPLAY_ID_REGEX = /^[A-Z2-9]{5}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars
export function generateDisplayId(): string {
  const bytes = randomBytes(5);
  let out = '';
  for (let i = 0; i < 5; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
