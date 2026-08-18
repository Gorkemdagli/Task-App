import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { MobileSidebar } from './MobileSidebar';
import { useQueryScopeCleanup } from '@/hooks/useQueryScopeCleanup';

/**
 * AppShell: authenticated app chrome.
 *
 * Density rule (FRONTEND.md §2):
 * - Topbar: tight (h-14, max)
 * - Sidebar: tight (260px, sıkı)
 * - Content area: generous (p-4 / md+: p-8)
 *
 * Signature element (FRONTEND.md §7): the 3-4px amber left border on
 * every active state (Topbar nav, Sidebar selected team, badge). Recurs
 * inside page-level components, not on the shell itself.
 */
export function AppShell() {
  useQueryScopeCleanup();
  return (
    <div
      data-testid="app-shell"
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      <Topbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
      <MobileSidebar />
    </div>
  );
}
