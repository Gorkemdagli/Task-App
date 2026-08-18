import { Clock } from 'lucide-react';
import type { TaskStatus } from '../../hooks/tasks';

const LABEL: Record<TaskStatus, string> = {
  todo: 'Yapılacak',
  in_progress: 'Yapılıyor',
  done: 'Yapıldı',
};

export function PendingStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-300">
      <Clock className="h-3 w-3" />
      Onay Bekliyor · {LABEL[status]}
    </span>
  );
}
