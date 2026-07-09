import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('hashes and verifies correct password', async () => {
    const hash = await hashPassword('hunter2-correct');
    expect(hash).toMatch(/^\$2b\$12\$/);
    expect(await verifyPassword('hunter2-correct', hash)).toBe(true);
  });

  it('rejects incorrect password', async () => {
    const hash = await hashPassword('hunter2-correct');
    expect(await verifyPassword('hunter2-wrong', hash)).toBe(false);
  });

  it('produces different hashes for same input (salt)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
  });
});
