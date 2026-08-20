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
      className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground"
    >
      <div className="shrink-0">
        <Topbar />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
      <MobileSidebar />
    </div>
  );
}
