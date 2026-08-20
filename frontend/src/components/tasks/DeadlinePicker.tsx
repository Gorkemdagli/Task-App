import { utcTodayCalendarDate } from '@/lib/calendarDate';

interface DeadlinePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
}

export function DeadlinePicker({
  value,
  onChange,
  disabled,
  required,
  invalid,
}: DeadlinePickerProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">
        Son Tarih{required ? ' *' : ''}
      </label>
      <input
        aria-label="Son Tarih"
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        min={utcTodayCalendarDate()}
        required={required}
        data-invalid={invalid ? 'true' : undefined}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 data-[invalid=true]:border-destructive"
      />
    </div>
  );
}
