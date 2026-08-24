import { useState } from 'react';

const principles = [
  'Üç sabit durum',
  'Net sorumluluk',
  'Tenant sınırı',
  'Görevde kalan bağlam',
] as const;

const roles = [
  {
    id: 'member',
    label: 'Üye',
    copy: 'Kendi görevini ilerletir; görev oluşturmaz, atamaz veya silemez.',
  },
  {
    id: 'team-admin',
    label: 'Takım Admini',
    copy: 'Yalnız yönettiği takımda görev ve üye akışını yönetir.',
  },
  {
    id: 'company-admin',
    label: 'Şirket Admini',
    copy: 'Kendi tenant kapsamındaki şirket, takım ve rol yönetimini yürütür.',
  },
] as const;

export function FeaturesSection() {
  const [activeRole, setActiveRole] = useState<(typeof roles)[number]['id']>('member');

  return (
    <section id="features" aria-labelledby="features-title" className="landing-features">
      <div className="landing-marquee" tabIndex={0}>
        <div className="landing-marquee__track">
          <ul aria-label="TaskFlow ürün prensipleri">
            {principles.map((principle) => (
              <li key={principle}>{principle}</li>
            ))}
          </ul>
          <div aria-hidden="true">
            <ul>
              {principles.map((principle) => (
                <li key={principle}>{principle}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="landing-section-shell">
        <header className="landing-section-heading">
          <h2 id="features-title">Özellikler</h2>
          <p>İşi görünür kılan üç davranış. Fazladan görünüm veya süreç yükü olmadan.</p>
        </header>

        <div
          data-testid="feature-bento"
          className="landing-bento grid grid-cols-1 grid-flow-dense lg:grid-cols-12 lg:grid-rows-2"
        >
          <article
            data-grid-cells="14"
            className="landing-bento-card landing-bento-card--kanban lg:col-span-7 lg:row-span-2"
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
            data-grid-cells="5"
            className="landing-bento-card landing-bento-card--message lg:col-span-5"
          >
            <div className="landing-bento-card__copy">
              <h3>Konuşma işin yanında kalır.</h3>
              <p>Karar, yorum ve güncelleme görev bağlamından kopmaz.</p>
            </div>
            <div className="landing-message-thread" aria-hidden="true">
              <span>Termin netleşti.</span>
              <span>Bağımlılık çözüldü.</span>
            </div>
          </article>

          <article
            data-grid-cells="5"
            className="landing-bento-card landing-bento-card--permissions lg:col-span-5"
          >
            <div className="landing-bento-card__copy">
              <h3>Yetki, çalışma alanını izler.</h3>
              <p>Her rol yalnız izin verilen tenant ve takım kapsamında hareket eder.</p>
            </div>
            <div className="landing-permission-lines" aria-hidden="true">
              <span>Tenant</span>
              <span>Takım</span>
              <span>Görev</span>
            </div>
          </article>
        </div>

        <div className="landing-role-accordion" aria-label="Rol sınırları">
          {roles.map((role) => {
            const active = activeRole === role.id;
            const triggerId = `role-trigger-${role.id}`;
            const panelId = `role-panel-${role.id}`;

            return (
              <div key={role.id} className="landing-role-panel" data-active={active}>
                <button
                  id={triggerId}
                  type="button"
                  aria-expanded={active}
                  aria-controls={panelId}
                  onFocus={() => setActiveRole(role.id)}
                  onMouseEnter={() => setActiveRole(role.id)}
                  onClick={() => setActiveRole(role.id)}
                >
                  {role.label}
                </button>
                <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!active}>
                  <p>{role.copy}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
