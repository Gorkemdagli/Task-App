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

      frames.forEach((frame) => {
        gsap.fromTo(
          frame,
          { y: 48, opacity: 0, scale: 0.82, transformOrigin: '50% 65%' },
          {
            y: 0,
            opacity: 1,
            scale: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: frame,
              start: 'top 88%',
              end: 'top 58%',
              scrub: 0.65,
              invalidateOnRefresh: true,
            },
          },
        );
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
