import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '../../lib/schemas';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

export function LoginPage() {
  const navigate = useNavigate();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setFormError(null);
    try {
      const res = await api.post('/auth/login', data);
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
        <h2 className="text-2xl font-semibold text-foreground">Giriş Yap</h2>
        <p className="mt-1 text-sm text-secondary-foreground">TaskFlow hesabınla devam et.</p>
      </div>
      {formError && (
        <div className="rounded-md border border-priority-high bg-card px-3 py-2 text-sm text-priority-high">
          {formError}
        </div>
      )}
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
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && (
          <p className="mt-1 text-xs text-priority-high">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
      </Button>
      <p className="text-center text-sm text-secondary-foreground">
        Hesabın yok mu?{' '}
        <Link to="/register" className="text-primary hover:underline">
          Kayıt ol
        </Link>
      </p>
    </form>
  );
}
