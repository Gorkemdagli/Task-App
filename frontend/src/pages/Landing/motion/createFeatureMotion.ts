import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function createFeatureMotion(root: HTMLElement): () => void {
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();

  if (!window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    media.add('(min-width: 768px)', () => {
      const cards = root.querySelectorAll<HTMLElement>('[data-feature-reveal]');

      gsap.from(cards, {
        y: 72,
        opacity: 0,
        stagger: 0.3,
        ease: 'none',
        scrollTrigger: {
          trigger: root.querySelector('[data-testid="feature-bento"]'),
          start: 'top 78%',
          end: 'center 48%',
          scrub: 0.65,
        },
      });
    });
  }

  return () => media.revert();
}
