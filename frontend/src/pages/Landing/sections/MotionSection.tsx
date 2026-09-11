import { useRef } from 'react';
import {
  Archive,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  LayoutDashboard,
  MessageCircle,
} from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { createLandingMotion } from '../motion/createLandingMotion';
import './MotionSection.css';

gsap.registerPlugin(useGSAP);

const statement =
  'İşleri netleştirin, ekibinizi aynı sayfada buluşturun, ilerlemeyi görün ve tamamlananları güvende tutun.';

const steps = [
  { title: 'Görevi aç', copy: 'Yeni bir göreve dönüştür.' },
  { title: 'Sorumluyu belirle', copy: 'Doğru kişiye atayın, netlik sağlayın.' },
  { title: 'Görevde konuş', copy: 'Tüm paydaşları aynı yerde.' },
  { title: 'Durumu ilerlet', copy: 'Süreci şeffaf şekilde yönetin.' },
  { title: 'Arşivde koru', copy: 'Tamamlanan işleri güvenle saklayın.' },
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
    <section
      ref={scope}
      id="workflow"
      aria-labelledby="motion-title"
      className="landing-motion workflow-redesign"
    >
      <div className="landing-section-shell">
        <div className="landing-lifecycle-intro">
          <h2 id="motion-title" aria-label="Bir görev açılır. Herkes ne olacağını bilir.">
            Bir görev açılır. <br />
            <span className="landing-lifecycle-heading-line--wide">Herkes ne olacağını bilir.</span>
          </h2>
          <div className="landing-lifecycle-intro__aside">
            <p>
              İşleri netleştirin, ekibinizi aynı sayfada buluşturun, ilerlemeyi görün ve
              tamamlananları güvende tutun.
            </p>
          </div>
        </div>

        <p className="landing-lifecycle-statement" aria-label={statement}>
          {statement.split(' ').map((word, index) => (
            <span key={`${word}-${index}`} data-motion-word aria-hidden>
              {word}{' '}
            </span>
          ))}
        </p>

        <div className="workflow-story" data-testid="lifecycle-ribbon">
          <ol className="workflow-steps" aria-label="Görev yaşam döngüsü">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </li>
            ))}
          </ol>

          <div className="workflow-window">
            <header className="workflow-toolbar">
              <span>
                <LayoutDashboard aria-hidden />
                <strong>Ürün Ekibi</strong>
                <span className="workflow-toolbar-divider">/</span>Görevler
              </span>
              <small>Örnek çalışma alanı</small>
            </header>
            <div className="workflow-workspace">
              <article className="workflow-board" data-motion-frame aria-label="Görev oluşturuldu">
                <div className="workflow-board-title">
                  <h3>Her işin yeri belli.</h3>
                  <span>Kanban görünümü</span>
                </div>
                <div className="workflow-columns">
                  <div className="workflow-column">
                    <h4>
                      <Circle aria-hidden />
                      Yapılacak<span>2</span>
                    </h4>
                    <div className="workflow-card">
                      <small>Görev oluşturuldu</small>
                      <strong>Bildirim tercihlerini belirle</strong>
                      <p>Önemli güncellemeleri netleştir.</p>
                      <div className="workflow-card-meta">
                        <span className="workflow-avatar" aria-hidden>
                          MK
                        </span>
                        <span>Mert Kaya</span>
                      </div>
                    </div>
                    <div className="workflow-card workflow-card--quiet">
                      <strong>Mevcut akışı incele</strong>
                      <div className="workflow-card-meta">
                        <CalendarDays aria-hidden />
                        <span>22 Nis</span>
                      </div>
                    </div>
                  </div>
                  <div className="workflow-column">
                    <h4>
                      <Circle aria-hidden />
                      Yapılıyor<span>1</span>
                    </h4>
                    <div className="workflow-card workflow-card--selected">
                      <small>
                        Seçili görev <ArrowRight aria-hidden />
                      </small>
                      <strong>Bildirim akışını sadeleştir</strong>
                      <p>Kullanıcılara giden bildirimleri daha anlaşılır hale getirelim.</p>
                      <div className="workflow-card-meta">
                        <span className="workflow-avatar" aria-hidden>
                          ZY
                        </span>
                        <span>Zeynep Yılmaz</span>
                        <MessageCircle aria-hidden />
                      </div>
                    </div>
                  </div>
                  <div className="workflow-column">
                    <h4>
                      <CheckCircle2 aria-hidden />
                      Yapıldı<span>1</span>
                    </h4>
                    <div className="workflow-card workflow-card--quiet">
                      <small>Tamamlandı</small>
                      <strong>Bildirim metinlerini düzenle</strong>
                      <div className="workflow-card-meta">
                        <span className="workflow-avatar" aria-hidden>
                          MK
                        </span>
                        <span>Mert Kaya</span>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article
                className="workflow-detail is-active"
                data-motion-frame
                aria-label="Seçili görev ayrıntıları"
              >
                <header>
                  <span>TASK-2847</span>
                  <span className="workflow-status">Yapılıyor</span>
                </header>
                <h3>Bildirim akışını sadeleştir</h3>
                <p>Kullanıcılara giden bildirimleri daha anlaşılır ve sade hale getirelim.</p>
                <dl>
                  <div>
                    <dt>Sorumlu</dt>
                    <dd>Zeynep Yılmaz</dd>
                  </div>
                  <div>
                    <dt>Son tarih</dt>
                    <dd>
                      <CalendarDays aria-hidden />
                      24 Nis 2025
                    </dd>
                  </div>
                  <div>
                    <dt>Öncelik</dt>
                    <dd>Yüksek</dd>
                  </div>
                </dl>
                <div className="workflow-comments">
                  <h4>
                    <MessageCircle aria-hidden />
                    Konuşma<span>2 yorum</span>
                  </h4>
                  <div>
                    <span className="workflow-avatar" aria-hidden>
                      MK
                    </span>
                    <p>
                      <strong>Mert Kaya</strong>Tasarım taslağını paylaştım. Görüşlerinizi
                      bekliyorum.
                    </p>
                  </div>
                  <div>
                    <span className="workflow-avatar" aria-hidden>
                      ZY
                    </span>
                    <p>
                      <strong>Zeynep Yılmaz</strong>Harika, birkaç küçük not ekledim.
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <article className="workflow-archive" data-motion-frame>
            <span className="workflow-archive-icon">
              <Archive aria-hidden />
            </span>
            <div>
              <h3>Görev tamamlandı. Bağlamı kaldı.</h3>
              <p>Tamamlanan iş güvenle saklanır; geçmişi kaybolmaz.</p>
            </div>
            <span className="workflow-archive-state">
              <CheckCircle2 aria-hidden />
              Arşivde
            </span>
          </article>
        </div>
      </div>
    </section>
  );
}
