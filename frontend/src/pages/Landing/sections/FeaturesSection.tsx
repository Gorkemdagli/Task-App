import { useRef } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  KeyRound,
  MessageCircle,
  Send,
  Users,
} from 'lucide-react';
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
        <div className="landing-context-layout">
          <div className="landing-context-copy">
            <p className="landing-context-kicker">DAHA ODAKLI İŞ, DAHA SAĞLAM TAKIMLAR</p>
            <h2 id="features-title" aria-label="İş ilerler. Bağlam yanında kalır.">
              İş ilerler. <br />
              Bağlam yanında kalır.
            </h2>
            <p className="landing-context-lede">
              TaskFlow, işleri sadece takip etmenizi değil, bağlamıyla birlikte ilerletmenizi
              sağlar. Sorumluluk, yetki, termin ve konuşmalar tek bir yerde, her zaman görünür.
            </p>

            <div className="landing-context-proof-row" aria-label="TaskFlow ilkeleri">
              <span>
                <Users aria-hidden />
                <strong>Tüm ekipler için</strong>
                <small>tek çalışma alanı</small>
              </span>
              <span>
                <Building2 aria-hidden />
                <strong>Büyüyen kurumlara</strong>
                <small>uygun yapı</small>
              </span>
              <span>
                <KeyRound aria-hidden />
                <strong>Verileriniz güvende</strong>
                <small>kontrol sizde</small>
              </span>
            </div>
          </div>

          <div data-testid="feature-bento" className="landing-context-map">
            <div className="landing-context-tether" data-testid="context-tether">
              <svg
                className="landing-context-connectors"
                data-testid="context-connectors"
                viewBox="0 0 800 566"
                preserveAspectRatio="none"
                aria-hidden
              >
                <defs>
                  <marker
                    id="landing-context-arrowhead"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                </defs>
                <path data-connection="owner" d="M232 88 H252 Q272 88 272 108 V170" />
                <path data-connection="team" d="M448 170 V112 Q448 88 472 88 H520" />
                <path
                  data-connection="conversation"
                  d="M504 288 H520 Q536 288 544 304 Q548 312 560 312"
                />
                <path
                  data-connection="permission"
                  d="M164 340 V402 Q164 422 144 422 H122 Q102 422 102 442 V480"
                />
                <path
                  data-connection="deadline"
                  d="M384 340 V402 Q384 422 404 422 H428 Q448 422 448 442 V480"
                />
                <path
                  data-connection="annotation"
                  className="landing-context-connectors__annotation"
                  d="M368 58 C374 92 365 116 344 132"
                  markerEnd="url(#landing-context-arrowhead)"
                />
              </svg>
              <div className="landing-context-annotation" aria-hidden>
                Aynı iş.
                <br />
                Daha fazla netlik.
              </div>

              <article
                className="landing-context-node landing-context-node--owner"
                data-context-node
                data-feature-reveal
              >
                <Users aria-hidden />
                <div>
                  <strong>Sorumlu</strong>
                  <b>Zeynep Arslan</b>
                  <small>Ürün Yöneticisi</small>
                </div>
              </article>

              <article
                className="landing-context-node landing-context-node--team"
                data-context-node
                data-feature-reveal
              >
                <Building2 aria-hidden />
                <div>
                  <strong>Takım</strong>
                  <b>Ürün Ekibi</b>
                  <small>Platform Geliştirme</small>
                </div>
                <ArrowRight aria-hidden />
              </article>

              <article className="landing-context-task" aria-label="Merkez görev">
                <header>
                  <span>TASK-2847</span>
                  <span className="landing-context-status">Devam ediyor</span>
                </header>
                <h3>Bildirim akışını sadeleştir</h3>
                <p>
                  Kullanıcının gerçekten önemli olan bildirimleri görmesini sağlayacak şekilde akışı
                  sadeleştir, gereksiz bildirimleri filtrele ve ayarları netleştir.
                </p>
                <div className="landing-context-task__tags">
                  <span>Bildirimler</span>
                  <span>Kullanıcı Deneyimi</span>
                  <span>Platform</span>
                  <span aria-label="Etiket ekle">+</span>
                </div>
              </article>

              <article
                className="landing-context-node landing-context-node--conversation landing-context-conversation"
                data-context-node
                data-feature-reveal
              >
                <MessageCircle aria-hidden />
                <div>
                  <strong>Konuşma</strong>
                </div>
                <div className="landing-context-message-list">
                  <div>
                    <span aria-hidden>MK</span>
                    <p>
                      <b>Mert Kaya</b>
                      <time>Bugün 10:24</time>
                      <small>Filtreleme mantığı tamam, son bir gözden geçirelim mi?</small>
                    </p>
                  </div>
                  <div>
                    <span aria-hidden>ZA</span>
                    <p>
                      <b>Zeynep Arslan</b>
                      <time>Bugün 11:03</time>
                      <small>Evet, özellikle sessize alma ayarlarını da ekleyelim.</small>
                    </p>
                  </div>
                  <span className="landing-context-message-input">
                    Mesaj yaz... <Send aria-hidden />
                  </span>
                </div>
              </article>

              <article
                className="landing-context-node landing-context-node--permission landing-context-permission"
                data-context-node
                data-feature-reveal
              >
                <KeyRound aria-hidden />
                <div>
                  <strong>Yetki</strong>
                  <b>Ürün ayarlarını düzenleyebilir</b>
                  <small>Ürün alanı · Düzenleme yetkisi</small>
                </div>
                <ArrowRight aria-hidden />
              </article>

              <article className="landing-context-node landing-context-node--deadline">
                <CalendarDays aria-hidden />
                <div>
                  <strong>Termin</strong>
                  <b>23 Mayıs 2025</b>
                  <small>5 gün kaldı</small>
                </div>
              </article>
            </div>
          </div>
        </div>

        <div className="landing-context-footer-line">
          <span>BAĞLAM SÜREKLİ, İŞ AKIŞINDA</span>
          <p>Her detay yerli yerinde, takımın hep aynı sayfada.</p>
          <a href="#workflow">
            TaskFlow ile neler mümkün? <ArrowRight aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
