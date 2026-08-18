import { useTaskFilters, type TaskFilters } from '@/hooks/useTaskFilters';
import { cn } from '@/lib/utils';
import type { TaskStatus, TaskPriority } from '@/hooks/tasks';

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'Yapılacak' },
  { value: 'in_progress', label: 'Yapılıyor' },
  { value: 'done', label: 'Yapıldı' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'high', label: 'Yüksek' },
  { value: 'medium', label: 'Orta' },
  { value: 'low', label: 'Düşük' },
];

const DEADLINE_OPTIONS: { value: TaskFilters['deadline']; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'overdue', label: 'Geçmiş' },
  { value: 'today', label: 'Bugün' },
  { value: 'week', label: 'Bu hafta' },
  { value: 'month', label: 'Bu ay' },
];

interface AssigneeOption {
  id: string;
  fullName: string;
}

interface FilterBarProps {
  teams?: { id: string; name: string }[];
  assignees?: AssigneeOption[];
}

export function FilterBar({ teams = [], assignees = [] }: FilterBarProps) {
  const { filters, updateFilters, resetFilters } = useTaskFilters();

  const toggleStatus = (s: TaskStatus) => {
    const next = filters.status.includes(s)
      ? filters.status.filter((x) => x !== s)
      : [...filters.status, s];
    updateFilters({ ...filters, status: next });
  };

  const togglePriority = (p: TaskPriority) => {
    const next = filters.priority.includes(p)
      ? filters.priority.filter((x) => x !== p)
      : [...filters.priority, p];
    updateFilters({ ...filters, priority: next });
  };

  const toggleAssignee = (id: string) => {
    const next = filters.assigneeIds.includes(id)
      ? filters.assigneeIds.filter((x) => x !== id)
      : [...filters.assigneeIds, id];
    updateFilters({ ...filters, assigneeIds: next });
  };

  const hasActive =
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.assigneeIds.length > 0 ||
    !!filters.teamId ||
    filters.deadline !== 'all' ||
    filters.includeArchived;

  return (
    <div data-testid="filter-bar" className="mb-6 flex flex-wrap items-center gap-2">
      <FilterGroup label="Durum">
        {STATUS_OPTIONS.map((o) => (
          <FilterChip
            key={o.value}
            active={filters.status.includes(o.value)}
            onClick={() => toggleStatus(o.value)}
            testId={`filter-status-${o.value}`}
          >
            {o.label}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label="Öncelik">
        {PRIORITY_OPTIONS.map((o) => (
          <FilterChip
            key={o.value}
            active={filters.priority.includes(o.value)}
            onClick={() => togglePriority(o.value)}
            testId={`filter-priority-${o.value}`}
          >
            {o.label}
          </FilterChip>
        ))}
      </FilterGroup>

      {assignees.length > 0 && (
        <FilterGroup label="Atanan">
          {assignees.map((a) => (
            <FilterChip
              key={a.id}
              active={filters.assigneeIds.includes(a.id)}
              onClick={() => toggleAssignee(a.id)}
              testId={`filter-assignee-${a.id}`}
            >
              {a.fullName}
            </FilterChip>
          ))}
        </FilterGroup>
      )}

      {teams.length > 0 && (
        <select
          aria-label="Takım filtresi"
          value={filters.teamId ?? ''}
          onChange={(e) => updateFilters({ ...filters, teamId: e.target.value || null })}
          className="h-8 rounded-md border border-border bg-secondary px-2 text-xs text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Tüm takımlar</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      <FilterGroup label="Tarih">
        {DEADLINE_OPTIONS.map((o) => (
          <FilterChip
            key={o.value}
            active={filters.deadline === o.value}
            onClick={() => updateFilters({ ...filters, deadline: o.value })}
            testId={`filter-deadline-${o.value}`}
          >
            {o.label}
          </FilterChip>
        ))}
      </FilterGroup>

      <label className="ml-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={filters.includeArchived}
          onChange={(e) => updateFilters({ ...filters, includeArchived: e.target.checked })}
          className="h-3 w-3 rounded border-border"
        />
        Arşivlenmiş
      </label>

      {hasActive && (
        <button
          type="button"
          onClick={resetFilters}
          className="ml-auto text-xs text-muted-foreground underline hover:text-primary"
        >
          Filtreleri temizle
        </button>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active}
      className={cn(
        'inline-flex h-7 items-center rounded-md border px-2 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-primary',
        active
          ? 'border-primary bg-primary text-black'
          : 'border-border bg-secondary text-secondary-foreground hover:border-primary/50',
      )}
    >
      {children}
    </button>
  );
}
