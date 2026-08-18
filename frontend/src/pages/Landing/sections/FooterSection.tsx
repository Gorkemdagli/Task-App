import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function FooterSection() {
  const { isAuthenticated } = useAuth();

  return (
    <footer className="landing-footer">
      <div className="landing-section-shell landing-footer__inner">
        <p className="landing-footer__statement">İş görünür. Sorumluluk net. Akış bozulmaz.</p>

        <div className="landing-footer__base">
          <p>© 2026 TaskFlow</p>
          <nav aria-label="Hesap bağlantıları">
            {isAuthenticated ? (
              <Link to="/dashboard">Panoya git</Link>
            ) : (
              <>
                <Link to="/login">Giriş yap</Link>
                <Link to="/register">Ücretsiz başla</Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </footer>
  );
}
