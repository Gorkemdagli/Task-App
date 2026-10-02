import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { scrollToLandingSection } from '../landingScroll';

export function FooterSection() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  return (
    <footer className="landing-footer">
      <div className="landing-section-shell landing-footer__inner">
        <div className="landing-footer__action">
          <div className="landing-footer__copy">
            <span className="landing-footer__eyebrow">{t('landing.footer.eyebrow')}</span>
            <p className="landing-footer__statement">{t('landing.footer.statement')}</p>
            <p className="landing-footer__description">
              {t('landing.footer.description')}
            </p>
            <dl className="landing-footer__signals">
              <div>
                <dt>{t('landing.footer.task')}</dt>
                <dd>{t('landing.footer.taskValue')}</dd>
              </div>
              <div>
                <dt>{t('landing.footer.team')}</dt>
                <dd>{t('landing.footer.teamValue')}</dd>
              </div>
              <div>
                <dt>{t('landing.footer.permission')}</dt>
                <dd>{t('landing.footer.permissionValue')}</dd>
              </div>
            </dl>
          </div>
          <div className="landing-footer__actions">
            {isAuthenticated ? (
              <Link to="/dashboard" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                {t('landing.cta.dashboard')}
              </Link>
            ) : (
              <>
                <Link to="/register" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                  {t('landing.cta.register')}
                </Link>
                <Link
                  to="/login"
                  className={`${buttonVariants({ variant: 'secondary', size: 'lg' })} landing-footer__secondary`}
                >
                  {t('landing.cta.login')}
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="landing-footer__base">
          <p>© 2026 TaskFlow</p>
          <a href="#hero" onClick={(event) => scrollToLandingSection(event, '#hero')}>
            {t('landing.footer.backToTop')}
          </a>
        </div>
      </div>
    </footer>
  );
}
