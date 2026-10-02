import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '../../hooks/tasks';

export function PendingStatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-300">
      <Clock className="h-3 w-3" />
      {t('tasks.status.pending')} · {t(`tasks.status.${status}`)}
    </span>
  );
}
