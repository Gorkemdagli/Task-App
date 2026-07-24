interface DeadlinePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
}

export function DeadlinePicker({ value, onChange, disabled, required, invalid }: DeadlinePickerProps) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">
        Son Tarih{required ? ' *' : ''}
      </label>
      <input
        type="date"
        value={value ? value.slice(0, 10) : ''}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        disabled={disabled}
        min={today}
        required={required}
        data-invalid={invalid ? 'true' : undefined}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 data-[invalid=true]:border-destructive"
      />
    </div>
  );
}
