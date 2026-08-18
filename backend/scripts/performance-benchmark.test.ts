import { describe, expect, it } from 'vitest';
import { percentile } from './performance-benchmark';

describe('percentile', () => {
  it('uses nearest-rank percentile', () => {
    expect(percentile([5, 1, 4, 2, 3], 0.95)).toBe(5);
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
  });
});
