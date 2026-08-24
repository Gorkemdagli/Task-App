import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { createFeatureMotion } from '../motion/createFeatureMotion';

gsap.registerPlugin(useGSAP);

export function FeaturesSection() {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!scope.current) return;
      return createFeatureMotion(scope.current);
    },
    { scope },
  );

  return (
    <section
      ref={scope}
      id="features"
      aria-labelledby="features-title"
      className="landing-features"
    >
      <div className="landing-section-shell">
        <header className="landing-section-heading">
          <h2 id="features-title">İşi görünür kılan üç davranış.</h2>
        </header>

        <div
          data-testid="feature-bento"
          className="landing-bento grid grid-cols-1 grid-flow-dense md:grid-cols-2 lg:grid-cols-12"
        >
          <article
            data-grid-cells="14"
            className="landing-bento-card landing-bento-card--kanban md:col-span-2 lg:col-span-7 lg:row-span-2"
          >
            <div className="landing-bento-card__copy">
              <h3>Akış sabit, ilerleme görünür.</h3>
              <p>Yapılacak, Yapılıyor ve Yapıldı. Üç durum ekipte ortak dil kurar.</p>
            </div>
            <div className="landing-mini-board" aria-hidden="true">
              <div>
                <span>Yapılacak</span>
                <strong>API sözleşmesini doğrula</strong>
              </div>
              <div>
                <span>Yapılıyor</span>
                <strong>Bildirim akışını sadeleştir</strong>
              </div>
              <div>
                <span>Yapıldı</span>
                <strong>Tenant sınırını test et</strong>
              </div>
            </div>
          </article>

          <article
            data-feature-reveal
            data-grid-cells="5"
            className="landing-bento-card landing-bento-card--message lg:col-span-5"
          >
            <div className="landing-bento-card__copy">
              <h3>Konuşma işin yanında kalır.</h3>
              <p>Karar, yorum ve güncelleme görev bağlamından kopmaz.</p>
            </div>
            <div className="landing-chatbox" aria-hidden="true">
              <div className="landing-chatbox__header">
                <span className="landing-chatbox__avatar">GK</span>
                <strong>Görev sohbeti</strong>
                <small>2 mesaj</small>
              </div>
              <div className="landing-message-thread">
                <div className="landing-message-bubble">
                  <strong>Selin</strong>
                  <p>Termin netleşti.</p>
                  <time dateTime="10:24">10:24</time>
                </div>
                <div className="landing-message-bubble">
                  <strong>Görkem</strong>
                  <p>Bağımlılık çözüldü.</p>
                  <time dateTime="10:31">10:31</time>
                </div>
              </div>
            </div>
          </article>

          <article
            data-feature-reveal
            data-grid-cells="5"
            className="landing-bento-card landing-bento-card--permissions lg:col-span-5"
          >
            <div className="landing-bento-card__copy">
              <h3>Yetki, çalışma alanını izler.</h3>
              <p>Her rol yalnız izin verilen tenant ve takım kapsamında hareket eder.</p>
            </div>
            <div
              className="landing-permission-lines landing-permission-lines--centered"
              aria-hidden="true"
            >
              <span>Tenant</span>
              <span>Takım</span>
              <span>Görev</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
