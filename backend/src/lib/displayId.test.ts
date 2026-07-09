import { describe, it, expect } from 'vitest';
import { generateDisplayId, DISPLAY_ID_REGEX } from './displayId';

describe('displayId', () => {
  it('returns 5-char string matching regex', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateDisplayId();
      expect(id).toMatch(DISPLAY_ID_REGEX);
      expect(id).toHaveLength(5);
    }
  });

  it('never contains confusing chars (I, O, 0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateDisplayId()).not.toMatch(/[IO01]/);
    }
  });
});
