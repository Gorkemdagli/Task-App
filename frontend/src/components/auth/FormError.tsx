export function FormError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="rounded-md border border-priority-high bg-card px-3 py-2 text-sm text-priority-high">
      {message}
    </div>
  );
}
