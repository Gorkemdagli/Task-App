import { FeatureCard } from '@/components/landing/FeatureCard';
import { features } from '@/pages/Landing/data/mockData';

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="flex min-h-screen flex-col justify-center py-16 md:py-24"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 md:px-6">
        <header className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <h2
            id="features-title"
            className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl"
          >
            Engineered for Velocity
          </h2>
          <p className="text-landing-muted md:text-lg">
            Everything you need to orchestrate complex workflows without the administrative bloat.
          </p>
        </header>

        {/* 2-column grid; items auto-flow. f1 (large) is internally bigger,
            f2 (small) is the standard cell, f3 (full-width) wraps row 2. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          {features.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
