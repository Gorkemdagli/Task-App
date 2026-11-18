import type { MouseEvent } from 'react';

export function scrollToLandingSection(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  deferScroll = false,
): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const section = document.getElementById(href.slice(1));
  if (!section) return;

  event.preventDefault();
  if (window.location.hash !== href) window.history.pushState(null, '', href);
  if (deferScroll) return;
  scrollToLandingHash(href);
}

export function scrollToCurrentLandingHash(): void {
  scrollToLandingHash(window.location.hash);
}

export function scrollToLandingHash(hash: string): void {
  document.getElementById(hash.slice(1))?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}
