import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { scrollToLandingSection } from '../landingScroll';

export function FooterSection() {
  const { isAuthenticated } = useAuth();

  return (
    <footer className="landing-footer">
      <div className="landing-section-shell landing-footer__inner">
        <div className="landing-footer__action">
          <div className="landing-footer__copy">
            <span className="landing-footer__eyebrow">TaskFlow ile ortak çalışma ritmi</span>
            <p className="landing-footer__statement">Ekipte neyin sırada olduğu açık kalsın.</p>
            <p className="landing-footer__description">
              Görev, ekip konuşması ve yetki sınırları tek çalışma alanında buluşsun.
            </p>
            <dl className="landing-footer__signals">
              <div>
                <dt>Görev</dt>
                <dd>Üç sabit durum</dd>
              </div>
              <div>
                <dt>Takım</dt>
                <dd>Net sorumluluk</dd>
              </div>
              <div>
                <dt>Yetki</dt>
                <dd>Tenant kapsamı</dd>
              </div>
            </dl>
          </div>
          <div className="landing-footer__actions">
            {isAuthenticated ? (
              <Link to="/dashboard" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                Panoya git
              </Link>
            ) : (
              <>
                <Link to="/register" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                  Ücretsiz başla
                </Link>
                <Link
                  to="/login"
                  className={`${buttonVariants({ variant: 'secondary', size: 'lg' })} landing-footer__secondary`}
                >
                  Giriş yap
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="landing-footer__base">
          <p>© 2026 TaskFlow</p>
          <a href="#hero" onClick={(event) => scrollToLandingSection(event, '#hero')}>
            Başa dön
          </a>
        </div>
      </div>
    </footer>
  );
}
