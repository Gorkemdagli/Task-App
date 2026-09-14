import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
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
      setFormError(getApiErrorMessage(err, 'Beklenmeyen bir hata oluştu'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Haydi başlayalım
        </p>
        <h2 className="mt-3 text-3xl font-semibold leading-tight text-foreground">Hesap Oluştur</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Ekibinizle daha verimli çalışmak için hesabınızı oluşturun.
        </p>
      </div>
      <FormError message={formError} />
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="fullName">
          Ad Soyad
        </label>
        <Input id="fullName" autoComplete="name" placeholder="Ad Soyad" {...register('fullName')} />
        {errors.fullName && (
          <p className="mt-1 text-xs text-priority-high">{errors.fullName.message}</p>
        )}
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="email">
          E-posta
        </label>
        <Input id="email" type="email" autoComplete="email" placeholder="E-posta" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-priority-high">{errors.email.message}</p>}
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="password">
          Şifre
        </label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Şifre"
            className="pr-11"
            {...register('password')}
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
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
        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="companyName">
          Şirket adı (opsiyonel)
        </label>
        <Input
          id="companyName"
          placeholder="Şirket adı (opsiyonel)"
          {...register('companyName')}
        />
      </div>
      <Button type="submit" className="w-full" disabled={submitDisabled}>
        {isSubmitting ? 'Oluşturuluyor...' : 'Hesap Oluştur'}
      </Button>
      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span>Zaten hesabınız var mı?</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <Link to="/login" className={`${buttonVariants({ variant: 'secondary', size: 'md' })} -mt-2 w-full`}>
        Giriş Yap
      </Link>
    </form>
  );
}
