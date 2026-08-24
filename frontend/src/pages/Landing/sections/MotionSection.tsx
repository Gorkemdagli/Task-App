import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { createLandingMotion } from '../motion/createLandingMotion';

gsap.registerPlugin(useGSAP);

const statement = 'Görev açılır, sorumluluk netleşir, ekip ilerler; bağlam görevle birlikte kalır.';

const frames = [
  {
    title: 'Görevi aç',
    copy: 'Takım veya Şirket Admini işi tanımlar ve sorumluyu belirler.',
  },
  {
    title: 'Önceliği netleştir',
    copy: 'Yetkili admin öncelik ve termini görünür kılar.',
  },
  {
    title: 'Görevde konuş',
    copy: 'Yorumlar, kararlar ve güncellemeler görev bağlamında tek yerde kalır.',
  },
  {
    title: 'Durumu ilerlet',
    copy: 'Sorumlu kendi görevini üç sabit durum arasında taşır.',
  },
  {
    title: 'Tamamla, arşivle',
    copy: 'Süresi dolan tamamlanmış iş silinmeden arşivde kalır.',
  },
] as const;

export function MotionSection() {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!scope.current) return;
      return createLandingMotion(scope.current);
    },
    { scope },
  );

  return (
    <section ref={scope} id="workflow" aria-labelledby="motion-title" className="landing-motion">
      <div className="landing-section-shell landing-motion__grid">
        <div data-motion-pin className="landing-motion__copy">
          <h2 id="motion-title">Görev ilerlerken bağlam kaybolmaz.</h2>
          <p aria-label={statement}>
            {statement.split(' ').map((word, index) => (
              <span key={`${word}-${index}`} data-motion-word aria-hidden>
                {word}{' '}
              </span>
            ))}
          </p>
        </div>
        <div className="landing-motion__frames">
          {frames.map((frame) => (
            <article key={frame.title} data-motion-frame>
              <h3>{frame.title}</h3>
              <p>{frame.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
