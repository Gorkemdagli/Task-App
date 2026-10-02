import { getPasswordStrength } from '../../lib/passwordStrength';
import { useTranslation } from 'react-i18next';

const FILLED = { weak: 1, medium: 2, strong: 3 } as const;
const COLOR = {
  weak: 'bg-priority-high',
  medium: 'bg-priority-medium',
  strong: 'bg-priority-low',
} as const;

export function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation();
  const s = getPasswordStrength(password);
  if (!s) return null;
  const filled = FILLED[s];
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-1 w-8 rounded-sm ${i <= filled ? COLOR[s] : 'bg-border'}`} />
        ))}
      </div>
      <span className="text-xs text-secondary-foreground">{t(`auth.password.strength.${s}`)}</span>
    </div>
  );
}
