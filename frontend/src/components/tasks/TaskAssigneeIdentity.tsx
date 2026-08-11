import type { ReactNode } from 'react';
import type { TaskAssignee } from '@/hooks/tasks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function TaskAssigneeIdentity({
  assignee,
  suffix,
}: {
  assignee: TaskAssignee;
  suffix?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-6 w-6">
        {assignee.user.avatarUrl && (
          <AvatarImage src={assignee.user.avatarUrl} alt={assignee.user.fullName} />
        )}
        <AvatarFallback>{assignee.user.fullName.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <span className="text-sm">{assignee.user.fullName}</span>
      {suffix}
    </div>
  );
}
