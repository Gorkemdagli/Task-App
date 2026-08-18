import type { ComponentType } from 'react';
import {
  LayoutDashboard,
  Users,
  ListTodo,
  MessageSquare,
  UserCircle,
  Shield,
  Settings,
  type LucideProps,
} from 'lucide-react';

export type AppRole = 'companyAdmin' | 'member';

export interface NavItem {
  path: string;
  label: string;
  Icon: ComponentType<LucideProps>;
  /**
   * If set, only users whose role is in this list see the item in Topbar / sidebar quick links.
   * Page-level role guards still enforce on direct URL access.
   */
  requiredRoles?: AppRole[];
}

export const PRIMARY_NAV: NavItem[] = [
  { path: '/dashboard', label: 'Ana Pano', Icon: LayoutDashboard },
  { path: '/teams', label: 'Takımlar', Icon: Users },
  { path: '/tasks', label: 'Görevler', Icon: ListTodo },
  { path: '/permissions', label: 'Yetkiler', Icon: Shield, requiredRoles: ['companyAdmin'] },
  { path: '/profile', label: 'Profil', Icon: UserCircle },
];

export const ALL_NAV: NavItem[] = [
  ...PRIMARY_NAV,
  { path: '/chat/:id', label: 'Mesajlaşma', Icon: MessageSquare },
  {
    path: '/company/settings',
    label: 'Şirket Ayarları',
    Icon: Settings,
    requiredRoles: ['companyAdmin'],
  },
];

export function canSeeNavItem(item: NavItem, role: AppRole | undefined): boolean {
  if (!item.requiredRoles) return true;
  return !!role && item.requiredRoles.includes(role);
}
