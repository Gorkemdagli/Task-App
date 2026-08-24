import { useRef, useState, type KeyboardEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { CompanySettingsContentPage } from '@/pages/CompanySettings';
import { CompanyDashboard } from './CompanyDashboard';

type CompanyTab = 'dashboard' | 'settings';

const tabs = [
  { id: 'dashboard', label: 'Şirket Dashboardu' },
  { id: 'settings', label: 'Şirket Ayarları' },
] as const;

export function CompanyManagementPage() {
  const { isCompanyAdmin } = useAuth();
  const [tab, setTab] = useState<CompanyTab>('dashboard');
  const tabRefs = useRef<Record<CompanyTab, HTMLButtonElement | null>>({
    dashboard: null,
    settings: null,
  });

  if (!isCompanyAdmin) return <Navigate to="/dashboard" replace />;

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: CompanyTab) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setTab(current);
      return;
    }

    const currentIndex = tabs.findIndex((item) => item.id === current);
    const targetIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : event.key === 'ArrowRight'
            ? (currentIndex + 1) % tabs.length
            : event.key === 'ArrowLeft'
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : null;

    if (targetIndex === null) return;
    event.preventDefault();
    tabRefs.current[tabs[targetIndex].id]?.focus();
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div role="tablist" aria-label="Şirket yönetimi">
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`company-${item.id}-tab`}
            ref={(node) => {
              tabRefs.current[item.id] = node;
            }}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`company-${item.id}-panel`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => handleTabKeyDown(event, item.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === item.id
                ? 'border-primary text-primary'
                : 'border-transparent text-secondary-foreground hover:text-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? (
        <section
          id="company-dashboard-panel"
          role="tabpanel"
          aria-labelledby="company-dashboard-tab"
        >
          <CompanyDashboard />
        </section>
      ) : (
        <section id="company-settings-panel" role="tabpanel" aria-labelledby="company-settings-tab">
          <CompanySettingsContentPage />
        </section>
      )}
    </div>
  );
}
