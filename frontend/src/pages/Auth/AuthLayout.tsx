import { Outlet } from 'react-router-dom';
import { BrandPanel } from '../../components/auth/BrandPanel';

/**
 * AuthLayout (FRONTEND.md §4.7, Faz 3 update):
 * - Centered card container (max-w-6xl) on the page background
 * - 50/50 split (lg+): BrandPanel left, form right
 * - <1024px: BrandPanel hidden, form panel takes full width
 * - Card has radius, border, shadow-panel (FRONTEND.md §4.6)
 *
 * The card is intentionally NOT full-screen — auth pages are entry points, not
 * the main workspace. Density rule (FRONTEND.md §2): form panel uses "sıkı"
 * rhythm (compact rows, small gaps) because the panel is small.
 */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <div className="grid w-full max-w-6xl min-h-[600px] grid-cols-1 overflow-hidden rounded-lg border border-border bg-card shadow-panel lg:grid-cols-2">
        <BrandPanel />
        <main className="flex items-center justify-center bg-card p-6 sm:p-8 md:p-12 lg:p-10 xl:p-12">
          <div className="w-full max-w-md">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
