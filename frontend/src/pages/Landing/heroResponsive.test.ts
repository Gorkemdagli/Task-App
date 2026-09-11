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

  it('keeps the desktop editorial heading open for the mock proportions', () => {
    const desktopHeading = landingCss.lastIndexOf(
      `.theme-landing .landing-hero__copy h1 {\n  max-width: none;`,
    );

    expect(desktopHeading).toBeGreaterThan(-1);
    expect(landingCss.slice(desktopHeading, desktopHeading + 180)).toContain('text-wrap: balance;');
    expect(landingCss.slice(desktopHeading, desktopHeading + 220)).toContain(
      'font-size: clamp(3.25rem, 4.8vw, 5.5rem);',
    );
  });

  it('adapts the context map to its own width', () => {
    const container = landingCss.lastIndexOf(
      `.theme-landing .landing-context-map {\n  container-type: inline-size;`,
    );
    const narrowLayout = landingCss.lastIndexOf(
      `@container (max-width: 37.9375rem) {\n  .theme-landing .landing-context-tether {`,
    );

    expect(container).toBeGreaterThan(-1);
    expect(narrowLayout).toBeGreaterThan(container);
    expect(landingCss.slice(narrowLayout, narrowLayout + 280)).toContain(
      'grid-template-columns: 1fr;',
    );

    const wideLayout = landingCss.lastIndexOf(
      `@container (min-width: 38rem) {\n  .theme-landing .landing-context-tether {`,
    );
    expect(landingCss.slice(wideLayout, wideLayout + 360)).toContain('grid-column: auto;');
    expect(landingCss.slice(wideLayout, wideLayout + 360)).toContain('grid-row: auto;');
  });

  it('leaves clear space between the task and its surrounding context cards', () => {
    const wideLayout = landingCss.lastIndexOf(
      `@container (min-width: 38rem) {\n  .theme-landing .landing-context-tether {`,
    );
    const desktopMap = landingCss.slice(wideLayout, wideLayout + 1800);

    expect(desktopMap).toContain('left: 0;\n    width: 30%;');
    expect(desktopMap).toContain('left: 12%;\n    width: 52%;');
    expect(desktopMap).toContain('width: 31%;');
    expect(desktopMap).toContain('left: 3%;\n    width: 36%;');
    expect(desktopMap).toContain('left: 48%;\n    width: 27%;');
  });

  it('keeps the context map in one column until the diagram has desktop width', () => {
    const layoutMedia = landingCss.lastIndexOf(
      `@media (max-width: 79.9375rem) {\n  .theme-landing .landing-hero__split,\n  .theme-landing .landing-context-layout {`,
    );

    expect(layoutMedia).toBeGreaterThan(-1);
    expect(
      landingCss.lastIndexOf(
        `@media (max-width: 63.9375rem) {\n  .theme-landing .landing-context-connectors`,
      ),
    ).toBe(-1);
  });

  it('anchors hero attachments above the comments input', () => {
    const inspector = landingCss.lastIndexOf(
      `.theme-landing .landing-hero-board__inspector {\n  grid-template-rows: repeat(7, auto) minmax(0, 1fr);`,
    );
    const comments = landingCss.lastIndexOf(
      `.theme-landing .landing-hero-board__inspector-comments {\n  display: flex;`,
    );
    const input = landingCss.lastIndexOf(`.theme-landing .landing-hero-board__comment-input {`);

    expect(inspector).toBeGreaterThan(-1);
    expect(comments).toBeGreaterThan(inspector);
    expect(input).toBeGreaterThan(comments);
    expect(landingCss.slice(input, input + 420)).toContain('margin-top: auto;');
  });

  it('keeps the attachment heading, file card, and add-file row stacked', () => {
    const attachment = landingCss.lastIndexOf(
      `.theme-landing .landing-hero-board__attachment {\n  display: grid;`,
    );

    expect(attachment).toBeGreaterThan(-1);
    expect(landingCss.slice(attachment, attachment + 260)).toContain(
      'grid-template-rows: auto auto auto;',
    );
    expect(landingCss.slice(attachment, attachment + 260)).toContain('grid-template-columns: 1fr;');
    expect(landingCss.slice(attachment, attachment + 520)).toContain(
      '.landing-hero-board__attachment > span',
    );
    expect(landingCss).toContain(
      '.theme-landing .landing-hero-board__attachment > span {\n  grid-column: 1;\n  grid-row: 2;',
    );
  });

  it('centers landing sections with desktop native scroll snap', () => {
    const desktopSnap = landingCss.lastIndexOf(
      '@media (min-width: 64rem) {\n  html:has(.landing-editorial) {',
    );

    expect(desktopSnap).toBeGreaterThan(-1);
    const snapBlock = landingCss.slice(desktopSnap, desktopSnap + 700);

    expect(snapBlock).toContain('scroll-snap-type: y mandatory;');
    expect(snapBlock).toContain('scroll-padding-block: var(--landing-nav-height) 0;');
    expect(snapBlock).toContain('.theme-landing main > section');
    expect(snapBlock).toContain('scroll-snap-align: center;');
    expect(snapBlock).toContain('scroll-snap-stop: always;');
    expect(snapBlock).toContain(
      '.theme-landing .landing-footer {\n    scroll-snap-align: center;\n    scroll-snap-stop: always;',
    );

    const smoothSnap = landingCss.lastIndexOf(
      '@media (min-width: 64rem) and (prefers-reduced-motion: no-preference) {\n  html:has(.landing-editorial) {',
    );
    expect(smoothSnap).toBeGreaterThan(desktopSnap);
    expect(landingCss.slice(smoothSnap, smoothSnap + 180)).toContain('scroll-behavior: smooth;');
  });

  it('fills desktop snap surfaces to the viewport without outer separators', () => {
    const desktopSurfaces = landingCss.lastIndexOf(
      '@media (min-width: 64rem) {\n  .theme-landing main > section.landing-hero,\n  .theme-landing main > section.landing-features,\n  .theme-landing main > section.landing-motion,\n  .theme-landing .landing-footer {',
    );

    expect(desktopSurfaces).toBeGreaterThan(-1);
    expect(landingCss.slice(desktopSurfaces, desktopSurfaces + 260)).toContain(
      'min-height: 100svh;',
    );
    expect(landingCss).not.toContain(
      'padding-block: clamp(6rem, 11vw, 11rem);\n  border-block: 1px solid var(--landing-border);',
    );
    expect(landingCss).not.toContain(
      'padding-block: clamp(5rem, 9vw, 9rem) 1.5rem;\n  border-top: 1px solid var(--landing-border);',
    );
  });
});
