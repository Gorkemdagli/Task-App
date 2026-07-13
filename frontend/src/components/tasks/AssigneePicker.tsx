interface AssigneeOption {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

interface AssigneePickerProps {
  members: AssigneeOption[];
  value: string | null;
  onChange: (userId: string) => void;
  disabled?: boolean;
}

export function AssigneePicker({ members, value, onChange, disabled }: AssigneePickerProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">Atanan Kişi</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.fullName}
          </option>
        ))}
      </select>
    </div>
  );
}
