import { Link } from 'react-router-dom';
import { ArrowRight, Play } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { HeroIllustration } from '@/components/landing/HeroIllustration';

export function HeroSection() {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? '/dashboard' : '/register';
  const primaryLabel = isAuthenticated ? "Dashboard'a git" : 'Start Free Trial';

  return (
    <section aria-labelledby="hero-title" className="flex min-h-screen items-center">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 py-20 md:px-6 lg:grid-cols-2 lg:gap-16">
        {/* Left column — copy + CTAs */}
        <div className="flex flex-col gap-6">
          <h1
            id="hero-title"
            className="text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl"
          >
            Manage your tasks with <span className="text-landing-primary">flow</span>
          </h1>

          <p className="max-w-lg text-base leading-relaxed text-landing-muted md:text-lg">
            The professional command center for high-performance teams. Deep focus, structured
            chaos, and uncompromising speed.
          </p>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Link to={primaryHref} className={buttonVariants({ variant: 'primary', size: 'lg' })}>
              {primaryLabel}
              {!isAuthenticated && <ArrowRight className="h-4 w-4" aria-hidden />}
            </Link>
            <button
              type="button"
              onClick={() => {
                const preview = document.getElementById('interactive-app-preview');
                preview?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={buttonVariants({ variant: 'secondary', size: 'lg' })}
            >
              <Play className="h-4 w-4" aria-hidden />
              Watch Demo
            </button>
          </div>

          <p className="mt-2 text-xs text-landing-muted">
            No credit card required. 14-day free trial.
          </p>
        </div>

        {/* Right column — illustration */}
        <div className="flex items-center justify-center lg:justify-end">
          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}
