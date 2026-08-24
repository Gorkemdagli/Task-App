// @ts-expect-error Vitest executes this test in Node; frontend tsconfig has no Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const nodeProcess = (globalThis as { process?: { cwd(): string } }).process;
const landingCss = readFileSync(`${nodeProcess?.cwd() ?? '.'}/src/index.css`, 'utf8').replaceAll(
  '\r\n',
  '\n',
);

describe('landing hero responsive layout', () => {
  it('stacks hero copy and board below the desktop split on mobile', () => {
    const desktopSplit = landingCss.lastIndexOf(
      `.theme-landing .landing-hero__split {\n  grid-template-columns: minmax(0, 0.95fr) minmax(24rem, 1.05fr);`,
    );
    const mobileSplit = landingCss.lastIndexOf(
      `@media (max-width: 47.9375rem) {\n  .theme-landing .landing-hero__split {`,
    );

    expect(desktopSplit).toBeGreaterThan(-1);
    expect(mobileSplit).toBeGreaterThan(desktopSplit);
    expect(landingCss.slice(mobileSplit, mobileSplit + 240)).toContain(
      'grid-template-columns: 1fr;',
    );
  });

  it('gives the completed lane more vertical space on mobile', () => {
    const mobileLifecycle = landingCss.lastIndexOf(
      `@media (max-width: 47.9375rem) {\n  .theme-landing .landing-hero-board__columns--lifecycle {`,
    );

    expect(mobileLifecycle).toBeGreaterThan(-1);
    expect(landingCss.slice(mobileLifecycle, mobileLifecycle + 240)).toContain(
      'grid-template-rows: auto minmax(9rem, auto);',
    );
  });
});
