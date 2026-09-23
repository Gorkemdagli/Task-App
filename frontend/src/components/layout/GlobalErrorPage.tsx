import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  clearGlobalError,
  hasGlobalErrorRetry,
  retryGlobalError,
  type GlobalErrorKind,
} from '@/lib/globalError';

type RecoveryStep = { title: string; description: string };
type ErrorContent = {
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  destination: string | null;
  steps: [RecoveryStep, RecoveryStep, RecoveryStep];
};

const content: Record<GlobalErrorKind, ErrorContent> = {
  network: {
    eyebrow: 'BAĞLANTI KURULAMADI',
    title: 'Bağlantı kurulamadı',
    description: 'Bağlantınızı kontrol edip yeniden deneyin.',
    action: 'Yeniden dene',
    destination: null,
    steps: [
      { title: 'Sayfa isteği', description: 'Sayfaya erişim isteğiniz alındı.' },
      { title: 'Bağlantı kontrolü', description: 'Bağlantı kurulamadı.' },
      { title: 'Yeniden dene', description: 'Bağlantı gelince tekrar deneyin.' },
    ],
  },
  'session-expired': {
    eyebrow: 'OTURUM SONA ERDİ',
    title: 'Oturumunuz sona erdi',
    description: 'Devam etmek için yeniden giriş yapın.',
    action: 'Giriş yap',
    destination: '/login',
    steps: [
      { title: 'Sayfa isteği', description: 'Sayfaya erişim isteğiniz alındı.' },
      { title: 'Oturum kontrolü', description: 'Oturumunuz sona erdi.' },
      { title: 'Giriş yap', description: 'Devam etmek için yeniden giriş yapın.' },
    ],
  },
  'sign-in-required': {
    eyebrow: 'GİRİŞ GEREKLİ',
    title: 'Bu sayfaya erişmek için giriş yapın',
    description: 'Devam etmek için TaskFlow hesabınızla giriş yapın.',
    action: 'Giriş yap',
    destination: '/login',
    steps: [
      { title: 'Sayfa isteği', description: 'Sayfaya erişim isteğiniz alındı.' },
      { title: 'Oturum kontrolü', description: 'Bu sayfayı görmek için giriş yapın.' },
      { title: 'Giriş yap', description: 'Giriş yaptıktan sonra devam edin.' },
    ],
  },
  'access-denied': {
    eyebrow: 'ERİŞİM DURDURULDU',
    title: 'Bu sayfaya erişim yetkiniz yok',
    description: 'İsterseniz güvenli bir sayfaya dönüp çalışmaya devam edebilirsiniz.',
    action: 'Kontrol paneline dön',
    destination: '/dashboard',
    steps: [
      { title: 'Sayfa isteği', description: 'Sayfaya erişim isteğiniz alındı.' },
      { title: 'Erişim kontrolü', description: 'Bu sayfaya erişim yetkiniz yok.' },
      { title: 'Güvenli sayfa', description: 'Kontrol paneline dönüp çalışmaya devam edin.' },
    ],
  },
  'not-found': {
    eyebrow: 'SAYFA BULUNAMADI',
    title: 'Aradığınız sayfa bulunamadı',
    description: 'Bağlantıyı kontrol edin veya kontrol paneline dönün.',
    action: 'Kontrol paneline dön',
    destination: '/dashboard',
    steps: [
      { title: 'Sayfa isteği', description: 'Sayfaya erişim isteğiniz alındı.' },
      { title: 'Sayfa kontrolü', description: 'Aradığınız sayfa bulunamadı.' },
      { title: 'Kontrol paneli', description: 'Çalışmaya güvenli bir yerden devam edin.' },
    ],
  },
  generic: {
    eyebrow: 'BİR SORUN OLUŞTU',
    title: 'Bir sorun oluştu',
    description: 'İstek tamamlanamadı. Biraz sonra yeniden deneyin.',
    action: 'Yeniden dene',
    destination: null,
    steps: [
      { title: 'Sayfa isteği', description: 'Sayfaya erişim isteğiniz alındı.' },
      { title: 'İşlem kontrolü', description: 'İstek tamamlanamadı.' },
      { title: 'Yeniden dene', description: 'Biraz sonra tekrar deneyin.' },
    ],
  },
};

export function GlobalErrorPage({ kind }: { kind: GlobalErrorKind }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const error = content[kind];

  useEffect(() => headingRef.current?.focus(), [kind]);

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground"
    >
      <div className="grid w-full max-w-7xl items-center gap-12 md:grid-cols-[minmax(260px,320px)_1px_minmax(0,1fr)] md:gap-x-16 lg:gap-x-24">
        <div className="relative min-h-[24rem] md:min-h-[30rem]">
          <span
            aria-hidden="true"
            className="absolute left-6 top-[16.666%] bottom-[16.666%] w-px bg-border"
          />
          <span
            aria-hidden="true"
            className="absolute left-6 top-1/2 bottom-[16.666%] w-px bg-primary"
          />
          <ol
            aria-label="Kurtarma adımları"
            className="relative grid min-h-[24rem] grid-rows-3 md:min-h-[30rem]"
          >
            {error.steps.map((step, index) => (
              <li
                key={step.title}
                aria-current={index === 1 ? 'step' : undefined}
                className="relative grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-6"
              >
                <span
                  aria-hidden="true"
                  className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border text-sm font-semibold ${
                    index === 1
                      ? 'border-primary bg-primary text-accent-foreground'
                      : index === 2
                        ? 'border-primary bg-background text-foreground'
                        : 'border-muted-foreground/50 bg-background text-foreground'
                  }`}
                >
                  {index === 1 ? '!' : index + 1}
                </span>
                <span className="relative z-10 bg-background py-1">
                  <span className="block font-semibold">{step.title}</span>
                  <span className="mt-2 block max-w-64 text-sm leading-6 text-muted-foreground">
                    {step.description}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div aria-hidden="true" className="hidden h-full min-h-96 w-px bg-border md:block" />

        <section role="alert" aria-labelledby="global-error-title" className="max-w-2xl">
          <p className="mb-6 text-sm font-semibold tracking-[0.24em] text-primary">
            {error.eyebrow}
          </p>
          <h1
            ref={headingRef}
            id="global-error-title"
            tabIndex={-1}
            className="text-5xl font-bold leading-[1.06] tracking-[-0.045em] md:text-6xl"
          >
            {error.title}
          </h1>
          <p className="mt-6 max-w-prose text-lg leading-7 text-muted-foreground md:text-xl md:leading-8">
            {error.description}
          </p>
          <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-4">
            {kind === 'network' || kind === 'generic' ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  if (hasGlobalErrorRetry()) retryGlobalError();
                  else window.location.reload();
                }}
              >
                {error.action}
              </Button>
            ) : (
              <Link
                to={error.destination ?? '/dashboard'}
                onClick={clearGlobalError}
                className={buttonVariants({ variant: 'primary', size: 'md' })}
              >
                {error.action}
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                clearGlobalError();
                window.history.back();
              }}
              className="inline-flex min-h-11 items-center gap-3 rounded-md px-1 text-base text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Geri dön
              <ArrowRight aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
