import { NavSection } from './sections/NavSection';
import { HeroSection } from './sections/HeroSection';
import { InteractivePreviewSection } from './sections/InteractivePreviewSection';
import { FeaturesSection } from './sections/FeaturesSection';
import { MotionSection } from './sections/MotionSection';
import { FooterSection } from './sections/FooterSection';

/**
 * Public marketing landing at `/`.
 * - Mounted outside `ProtectedRoute` (see App.tsx) so logged-out users see it.
 * - `.theme-landing` scope remaps `--color-primary` to the spec's orange
 *   (Button.primary inside this tree becomes orange, app stays amber).
 * - Logged-in users hit landing with CTAs pointing to /dashboard.
 */
export function LandingPage() {
  return (
    <div className="theme-landing landing-editorial min-h-screen overflow-x-hidden w-full max-w-full">
      <NavSection />

      <main>
        <HeroSection />
        <FeaturesSection />
        <MotionSection />
        <InteractivePreviewSection />
      </main>

      <FooterSection />
    </div>
  );
}
