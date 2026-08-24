import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function createLandingMotion(root: HTMLElement): () => void {
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  let disposed = false;

  if (!window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    media.add('(min-width: 1024px)', () => {
      const words = root.querySelectorAll<HTMLElement>('[data-motion-word]');
      const frames = root.querySelectorAll<HTMLElement>('[data-motion-frame]');

      gsap.to(words, {
        opacity: 1,
        stagger: 0.08,
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 'top 70%',
          end: 'center 35%',
          scrub: 0.6,
        },
      });

      gsap.to(frames, {
        yPercent: -12,
        opacity: 1,
        stagger: 0.12,
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.8,
          pin: root.querySelector('[data-motion-pin]'),
          invalidateOnRefresh: true,
        },
      });
    });
  }

  void document.fonts?.ready.then(() => {
    if (!disposed) ScrollTrigger.refresh();
  });

  return () => {
    disposed = true;
    media.revert();
  };
}
