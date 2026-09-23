import { describe, expect, it } from 'vitest';
import { classifyGlobalError } from './globalError';

describe('classifyGlobalError', () => {
  it.each([
    [401, 'session-expired'],
    [403, 'access-denied'],
    [404, 'not-found'],
    [500, 'generic'],
  ] as const)('maps HTTP %i safely', (status, expected) => {
    expect(classifyGlobalError({ response: { status } })).toBe(expected);
  });

  it('maps an Axios transport failure to network unavailable', () => {
    expect(classifyGlobalError({ isAxiosError: true, code: 'ERR_NETWORK' })).toBe('network');
  });

  it('keeps unknown errors generic', () => {
    expect(classifyGlobalError(new Error('internal detail'))).toBe('generic');
  });
});
