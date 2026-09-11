import { Link } from 'react-router-dom';
import { ListTodo, MessageCircle, Users } from 'lucide-react';
import { HeroIllustration } from '@/components/landing/HeroIllustration';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function HeroSection() {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? '/dashboard' : '/register';
  const primaryLabel = isAuthenticated ? 'Panoya git' : 'Ücretsiz başla';

  return (
    <section id="hero" aria-labelledby="hero-title" className="landing-hero">
      <div className="landing-section-shell landing-hero__inner">
        <div className="landing-hero__split">
          <div className="landing-hero__copy">
            <p className="landing-hero-kicker">EKİPLER İÇİN İŞ YÖNETİMİ</p>
            <h1
              id="hero-title"
              className="max-w-6xl"
              aria-label="İşin nerede kaldığını herkes görsün."
            >
              <span className="landing-hero-heading-line">İşin nerede</span> <br />
              <span className="landing-hero-heading-line landing-hero-heading-line--wide">
                kaldığını herkes görsün.
              </span>
            </h1>
            <p>Görev, sorumluluk ve konuşma aynı görünür akışta kalsın.</p>

            <div className="landing-hero__actions">
              <Link
                to={primaryHref}
                className={`${buttonVariants({ variant: 'primary', size: 'lg' })} landing-hero-cta`}
              >
                {primaryLabel}
              </Link>
              <a
                href="#workflow"
                className={`${buttonVariants({ variant: 'secondary', size: 'lg' })} landing-hero-cta`}
              >
                İş akışını gör
              </a>
            </div>

            <div className="landing-hero-proof-strip" aria-label="TaskFlow çalışma ilkeleri">
              <div>
                <ListTodo aria-hidden />
                <strong>Tüm işler tek yerde</strong>
                <p>Görevleri, sorumlulukları ve konuşmaları bir arada tutun.</p>
              </div>
              <div>
                <Users aria-hidden />
                <strong>Doğru yetki, doğru ekip</strong>
                <p>Ekiplerinizi güvenle yönetin, herkes kendi işine odaklansın.</p>
              </div>
              <div>
                <MessageCircle aria-hidden />
                <strong>Görünür iletişim</strong>
                <p>Kararlar ve konuşmalar görevin içinde kalsın.</p>
              </div>
            </div>
          </div>

          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}
