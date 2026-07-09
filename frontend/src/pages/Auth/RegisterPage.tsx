import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { registerSchema, type RegisterInput } from '../../lib/schemas';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { getPasswordStrength } from '../../lib/passwordStrength';
import { PasswordStrength } from '../../components/auth/PasswordStrength';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

export function RegisterPage() {
  const navigate = useNavigate();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { companyName: '' },
  });
  const password = watch('password') ?? '';
  const strength = getPasswordStrength(password);
  const submitDisabled = isSubmitting || strength === 'weak' || strength === null;

  const onSubmit = async (data: RegisterInput) => {
    setFormError(null);
    const payload = data.companyName?.trim() ? data : { ...data, companyName: undefined };
    try {
      const res = await api.post('/auth/register', payload);
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Beklenmeyen bir hata oluştu');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Hesap Oluştur</h2>
        <p className="mt-1 text-sm text-secondary-foreground">TaskFlow'a katıl.</p>
      </div>
      {formError && (
        <div className="rounded-md border border-priority-high bg-card px-3 py-2 text-sm text-priority-high">
          {formError}
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm text-foreground" htmlFor="fullName">
          Ad Soyad
        </label>
        <Input id="fullName" autoComplete="name" {...register('fullName')} />
        {errors.fullName && (
          <p className="mt-1 text-xs text-priority-high">{errors.fullName.message}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm text-foreground" htmlFor="email">
          E-posta
        </label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-priority-high">{errors.email.message}</p>}
      </div>
      <div>
        <label className="mb-1 block text-sm text-foreground" htmlFor="password">
          Şifre
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        <PasswordStrength password={password} />
        {errors.password && (
          <p className="mt-1 text-xs text-priority-high">{errors.password.message}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm text-secondary-foreground" htmlFor="companyName">
          🏢 Şirket adı (opsiyonel)
        </label>
        <Input id="companyName" placeholder="Benzersiz olmalıdır" {...register('companyName')} />
      </div>
      <Button type="submit" disabled={submitDisabled}>
        {isSubmitting ? 'Oluşturuluyor...' : 'Hesap Oluştur'}
      </Button>
      <p className="text-center text-sm text-secondary-foreground">
        Hesabın var mı?{' '}
        <Link to="/login" className="text-primary hover:underline">
          Giriş yap
        </Link>
      </p>
    </form>
  );
}
