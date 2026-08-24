import type { MouseEvent } from 'react';

export function scrollToLandingSection(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const section = document.getElementById(href.slice(1));
  if (!section) return;

  event.preventDefault();
  section.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}
