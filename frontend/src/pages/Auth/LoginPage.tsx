import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { loginSchema, type LoginInput } from '../../lib/schemas';
import { authApi } from '../../lib/api';
import { queryClient } from '../../lib/react-query';
import { getApiErrorMessage } from '../../lib/apiError';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { FormError } from '../../components/auth/FormError';
import { Button, buttonVariants } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

export function LoginPage() {
  const navigate = useNavigate();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const clearActiveTeam = useTeamStore((s) => s.clearActiveTeam);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setFormError(null);
    try {
      const res = await authApi.post('/login', data);
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      clearActiveTeam();
      queryClient.clear();
      navigate('/dashboard');
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, 'Beklenmeyen bir hata oluştu'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Tekrar hoş geldiniz
        </p>
        <h2 className="mt-3 text-3xl font-semibold leading-tight text-foreground">Giriş Yap</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Hesabınıza giriş yaparak kaldığınız yerden devam edin.
        </p>
      </div>
      <FormError message={formError} />
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
            autoComplete="current-password"
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
        {errors.password && (
          <p className="mt-1 text-xs text-priority-high">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
      </Button>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span>Hesabınız yok mu?</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <Link to="/register" className={`${buttonVariants({ variant: 'secondary', size: 'md' })} -mt-2 w-full`}>
        Hesap Oluştur
      </Link>
    </form>
  );
}
