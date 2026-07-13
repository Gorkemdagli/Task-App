interface DeadlinePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
  disabled?: boolean;
}

export function DeadlinePicker({ value, onChange, disabled }: DeadlinePickerProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">Son Tarih</label>
      <input
        type="date"
        value={value ? value.slice(0, 10) : ''}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        disabled={disabled}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
