import type { Comment } from '@/hooks/tasks';

interface CommentListProps {
  comments: Comment[];
}

export function CommentList({ comments }: CommentListProps) {
  if (comments.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">Henüz yorum yok. İlk yorumu sen yaz.</p>
    );
  }

  return (
    <ul data-testid="comment-list" className="divide-y divide-border">
      {comments.map((c) => (
        <li
          key={c.id}
          data-testid={`comment-${c.id}`}
          className="py-3 text-card-foreground first:pt-0"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              {c.author.fullName
                .split(' ')
                .map((part) => part[0]?.toUpperCase() ?? '')
                .slice(0, 2)
                .join('')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold">{c.author.fullName}</span>
                <time className="text-xs text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-foreground/90">{c.body}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
