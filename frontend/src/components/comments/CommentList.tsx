import type { Comment } from '@/hooks/tasks';

interface CommentListProps {
  comments: Comment[];
}

export function CommentList({ comments }: CommentListProps) {
  if (comments.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
        Henüz yorum yok. İlk yorumu sen yaz.
      </p>
    );
  }

  return (
    <ul data-testid="comment-list" className="space-y-3">
      {comments.map((c) => (
        <li
          key={c.id}
          data-testid={`comment-${c.id}`}
          className="rounded-md border border-border bg-card p-3 text-card-foreground"
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">
              {c.author.fullName.charAt(0)}
            </span>
            <span className="text-sm font-medium">{c.author.fullName}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(c.createdAt).toLocaleString('tr-TR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
        </li>
      ))}
    </ul>
  );
}
