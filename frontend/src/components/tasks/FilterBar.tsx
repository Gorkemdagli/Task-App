import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp, ListFilter, X } from 'lucide-react';
import { useTaskFilters, type TaskFilters } from '@/hooks/useTaskFilters';
import { cn } from '@/lib/utils';
import type { TaskStatus, TaskPriority } from '@/hooks/tasks';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

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
  currentUserId?: string;
}

interface FilterOptionsProps extends FilterBarProps {
  filters: TaskFilters;
  updateFilters: (next: TaskFilters) => void;
  resetFilters: () => void;
}

export function FilterBar({ teams = [], assignees = [], currentUserId }: FilterBarProps) {
  const { filters, updateFilters, resetFilters } = useTaskFilters();
  const [mobileOpen, setMobileOpen] = useState(false);

  const options = (
    <FilterOptions
      filters={filters}
      updateFilters={updateFilters}
      resetFilters={resetFilters}
      teams={teams}
      assignees={assignees}
      currentUserId={currentUserId}
    />
  );

  return (
    <aside data-testid="filter-bar" className="w-full shrink-0 lg:h-full lg:w-60">
      <div
        data-testid="task-filter-rail"
        className="hidden rounded-lg border border-border bg-card lg:block lg:h-full lg:overflow-y-auto"
      >
        {options}
      </div>

      <div className="lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="secondary" className="w-full justify-start">
              <ListFilter className="h-4 w-4" />
              Filtreler
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(90vw,320px)] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filtreler</SheetTitle>
            </SheetHeader>
            <div className="mt-6">{options}</div>
          </SheetContent>
        </Sheet>
      </div>
    </aside>
  );
}

function FilterOptions({
  filters,
  updateFilters,
  resetFilters,
  teams = [],
  assignees = [],
  currentUserId,
}: FilterOptionsProps) {
  const toggleStatus = (status: TaskStatus) => {
    const next = filters.status.includes(status)
      ? filters.status.filter((value) => value !== status)
      : [...filters.status, status];
    updateFilters({ ...filters, status: next });
  };

  const togglePriority = (priority: TaskPriority) => {
    const next = filters.priority.includes(priority)
      ? filters.priority.filter((value) => value !== priority)
      : [...filters.priority, priority];
    updateFilters({ ...filters, priority: next });
  };

  const toggleAssignee = (id: string) => {
    const next = filters.assigneeIds.includes(id)
      ? filters.assigneeIds.filter((value) => value !== id)
      : [...filters.assigneeIds, id];
    updateFilters({ ...filters, assigneeIds: next });
  };

  const hasActive =
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.assigneeIds.length > 0 ||
    !!filters.teamId ||
    filters.deadline !== 'all' ||
    !!filters.deadlineFrom ||
    !!filters.deadlineTo ||
    filters.includeArchived;

  const otherAssignees = assignees.filter((assignee) => assignee.id !== currentUserId);
  const [showAllAssignees, setShowAllAssignees] = useState(false);
  const visibleAssignees = showAllAssignees ? otherAssignees : otherAssignees.slice(0, 3);

  return (
    <div className="divide-y divide-border">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-secondary-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Filtreler</h2>
        </div>
        {hasActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-secondary-foreground underline underline-offset-2 hover:text-primary"
          >
            Temizle
          </button>
        )}
      </div>

      <FilterGroup label="Durum">
        <FilterChip
          active={filters.status.length === 0}
          onClick={() => updateFilters({ ...filters, status: [] })}
          testId="filter-status-all"
        >
          Tümü
        </FilterChip>
        {STATUS_OPTIONS.map((option) => (
          <FilterChip
            key={option.value}
            active={filters.status.includes(option.value)}
            onClick={() => toggleStatus(option.value)}
            testId={`filter-status-${option.value}`}
          >
            {option.label}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label="Öncelik">
        <FilterChip
          active={filters.priority.length === 0}
          onClick={() => updateFilters({ ...filters, priority: [] })}
          testId="filter-priority-all"
        >
          Tümü
        </FilterChip>
        {PRIORITY_OPTIONS.map((option) => (
          <FilterChip
            key={option.value}
            active={filters.priority.includes(option.value)}
            onClick={() => togglePriority(option.value)}
            testId={`filter-priority-${option.value}`}
          >
            {option.label}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label="Atanan">
        <FilterChip
          active={filters.assigneeIds.length === 0}
          onClick={() => updateFilters({ ...filters, assigneeIds: [] })}
          testId="filter-assignee-all"
        >
          Tümü
        </FilterChip>
        {currentUserId && (
          <FilterChip
            active={filters.assigneeIds.includes(currentUserId)}
            onClick={() => toggleAssignee(currentUserId)}
            testId="filter-assignee-current-user"
          >
            Sadece bana ait
          </FilterChip>
        )}
        {visibleAssignees.map((assignee) => (
          <FilterChip
            key={assignee.id}
            active={filters.assigneeIds.includes(assignee.id)}
            onClick={() => toggleAssignee(assignee.id)}
            testId={`filter-assignee-${assignee.id}`}
          >
            {assignee.fullName}
          </FilterChip>
        ))}
        {otherAssignees.length > 3 && (
          <button
            type="button"
            aria-expanded={showAllAssignees}
            onClick={() => setShowAllAssignees((visible) => !visible)}
            className="flex min-h-8 w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs text-secondary-foreground hover:text-foreground"
          >
            {showAllAssignees ? 'Daha azı' : 'Daha fazlası'}
            {showAllAssignees ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        )}
      </FilterGroup>

      {teams.length > 0 && (
        <FilterGroup label="Takım filtresi">
          <FilterChip
            active={!filters.teamId}
            onClick={() => updateFilters({ ...filters, teamId: null })}
            testId="filter-team-all"
          >
            Tümü
          </FilterChip>
          {teams.map((team) => (
            <FilterChip
              key={team.id}
              active={filters.teamId === team.id}
              onClick={() => updateFilters({ ...filters, teamId: team.id })}
              testId={`filter-team-${team.id}`}
            >
              {team.name}
            </FilterChip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup label="Tarih">
        {DEADLINE_OPTIONS.map((option) => (
          <FilterChip
            key={option.value}
            active={filters.deadline === option.value}
            onClick={() => updateFilters({ ...filters, deadline: option.value })}
            testId={`filter-deadline-${option.value}`}
          >
            {option.label}
          </FilterChip>
        ))}
      </FilterGroup>

      <div className="px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-secondary-foreground">
          <input
            type="checkbox"
            checked={filters.includeArchived}
            onChange={(event) =>
              updateFilters({ ...filters, includeArchived: event.target.checked })
            }
            className="h-4 w-4 rounded-sm border-border accent-primary"
          />
          Arşivlenmiş
        </label>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-1 px-4 py-3">
      <legend className="mb-1 text-xs font-semibold text-foreground">{label}</legend>
      <div className="space-y-1">{children}</div>
    </fieldset>
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
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active}
      className={cn(
        'flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active
          ? 'bg-primary text-black hover:bg-primary-hover'
          : 'text-secondary-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
          active ? 'border-black/20 bg-black/10' : 'border-border',
        )}
      >
        {active && <Check className="h-3 w-3" />}
      </span>
      {children}
    </button>
  );
}

export function ActiveFilterChips({ teams = [], assignees = [], currentUserId }: FilterBarProps) {
  const { filters, updateFilters } = useTaskFilters();
  const chips: { id: string; label: string; remove: () => void }[] = [];
  const add = (id: string, label: string, remove: () => void) => chips.push({ id, label, remove });

  filters.status.forEach((value) => {
    const label = STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
    add(`status-${value}`, label, () =>
      updateFilters({ ...filters, status: filters.status.filter((item) => item !== value) }),
    );
  });
  filters.priority.forEach((value) => {
    const label = PRIORITY_OPTIONS.find((option) => option.value === value)?.label ?? value;
    add(`priority-${value}`, label, () =>
      updateFilters({ ...filters, priority: filters.priority.filter((item) => item !== value) }),
    );
  });
  filters.assigneeIds.forEach((value) => {
    const label =
      value === currentUserId
        ? 'Sadece bana ait'
        : (assignees.find((assignee) => assignee.id === value)?.fullName ?? value);
    add(`assignee-${value}`, label, () =>
      updateFilters({
        ...filters,
        assigneeIds: filters.assigneeIds.filter((item) => item !== value),
      }),
    );
  });
  if (filters.teamId) {
    add(
      `team-${filters.teamId}`,
      teams.find((team) => team.id === filters.teamId)?.name ?? filters.teamId,
      () => updateFilters({ ...filters, teamId: null }),
    );
  }
  if (filters.deadline !== 'all') {
    add(
      `deadline-${filters.deadline}`,
      DEADLINE_OPTIONS.find((option) => option.value === filters.deadline)?.label ?? 'Tarih',
      () => updateFilters({ ...filters, deadline: 'all', deadlineFrom: null, deadlineTo: null }),
    );
  }
  if (filters.deadlineFrom || filters.deadlineTo) {
    add('deadline-custom', 'Özel tarih aralığı', () =>
      updateFilters({ ...filters, deadline: 'all', deadlineFrom: null, deadlineTo: null }),
    );
  }
  if (filters.includeArchived) {
    add('archived', 'Arşivlenmiş', () => updateFilters({ ...filters, includeArchived: false }));
  }

  if (chips.length === 0) return null;

  return (
    <div data-testid="active-filter-chips" className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <div
          key={chip.id}
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary"
        >
          <span data-testid={`active-filter-${chip.id}`}>{chip.label}</span>
          <button
            type="button"
            data-testid={`remove-filter-${chip.id}`}
            onClick={chip.remove}
            aria-label={`${chip.label} filtresini kaldır`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
