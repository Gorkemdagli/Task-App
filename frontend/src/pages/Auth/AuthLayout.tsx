import { Outlet } from 'react-router-dom';
import { BrandPanel } from '../../components/auth/BrandPanel';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <BrandPanel />
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
