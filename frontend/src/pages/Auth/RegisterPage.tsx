import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Info } from 'lucide-react';
import { registerSchema, type RegisterInput } from '../../lib/schemas';
import { authApi } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/apiError';
import { useAuthStore } from '../../stores/authStore';
import { getPasswordStrength } from '../../lib/passwordStrength';
import { PasswordStrength } from '../../components/auth/PasswordStrength';
import { Button, buttonVariants } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormError } from '../../components/auth/FormError';

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { companyName: '' },
  });
  const password = useWatch({ control, name: 'password', defaultValue: '' });
  const strength = getPasswordStrength(password);
  const submitDisabled = isSubmitting || strength === 'weak' || strength === null;

  const onSubmit = async (data: RegisterInput) => {
    setFormError(null);
    const payload = data.companyName?.trim() ? data : { ...data, companyName: undefined };
    try {
      const res = await authApi.post('/register', payload);
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, t('auth.error.unexpected')));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t('auth.register.welcome')}
        </p>
        <h2 className="mt-3 text-3xl font-semibold leading-tight text-foreground">{t('auth.register.title')}</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t('auth.register.description')}
        </p>
      </div>
      <FormError message={formError} />
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="fullName">
          {t('auth.register.fullName')}
        </label>
        <Input id="fullName" autoComplete="name" placeholder={t('auth.register.fullName')} {...register('fullName')} />
        {errors.fullName && (
          <p className="mt-1 text-xs text-priority-high">{errors.fullName.message}</p>
        )}
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="email">
          {t('auth.register.email')}
        </label>
        <Input id="email" type="email" autoComplete="email" placeholder={t('auth.register.email')} {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-priority-high">{errors.email.message}</p>}
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="password">
          {t('auth.register.password')}
        </label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={t('auth.register.password')}
            className="pr-11"
            {...register('password')}
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={showPassword ? t('auth.password.hide') : t('auth.password.show')}
            aria-pressed={showPassword}
            aria-controls="password"
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        <PasswordStrength password={password} />
        {errors.password && (
          <p className="mt-1 text-xs text-priority-high">{errors.password.message}</p>
        )}
        </div>
      <div>
        <div className="mb-2 flex items-center gap-1">
          <label className="text-sm font-medium text-foreground" htmlFor="companyName">
              {t('auth.register.companyName')}
          </label>
          <span className="group relative inline-flex">
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t('auth.register.companyNameInfoLabel')}
              aria-describedby="companyNameInfo"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <p
              id="companyNameInfo"
              role="tooltip"
              className="invisible absolute left-1/2 top-full z-10 mt-1 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-border bg-card p-2 text-xs leading-relaxed text-muted-foreground opacity-0 shadow-md group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 md:left-0 md:translate-x-0"
            >
              {t('auth.register.companyNameInfo')}
            </p>
          </span>
        </div>
        <Input
          id="companyName"
          placeholder={t('auth.register.companyName')}
          {...register('companyName')}
        />
      </div>
      <Button type="submit" className="w-full" disabled={submitDisabled}>
        {isSubmitting ? t('auth.register.submitting') : t('auth.register.title')}
      </Button>
      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span>{t('auth.register.haveAccount')}</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <Link to="/login" className={`${buttonVariants({ variant: 'secondary', size: 'md' })} -mt-2 w-full`}>
        {t('auth.register.signIn')}
      </Link>
    </form>
  );
}
