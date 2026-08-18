/**
 * Landing page mock data + types (single consumer — kept co-located).
 * Source: user-provided JSON spec for TaskFlow marketing landing.
 */

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';
export type FeatureSize = 'large' | 'small' | 'full-width';

export interface Project {
  id: string;
  name: string;
  active: boolean;
}

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  assignee: string;
}

export type ColumnId = 'todo' | 'in-progress' | 'done';

export interface KanbanColumn {
  id: ColumnId;
  title: string;
  tasks: Task[];
}

export type MilestoneStatus = 'on-track' | 'pending' | 'at-risk';

export interface Milestone {
  title: string;
  date: string;
  status: MilestoneStatus;
}

export interface FeatureItem {
  id: string;
  icon: 'kanban' | 'message' | 'shield';
  title: string;
  description: string;
  size: FeatureSize;
  badges?: string[];
}

export interface WorkflowStep {
  stepNumber: number;
  title: string;
  description: string;
}

export interface FooterLink {
  label: string;
  url: string;
}

export interface FooterGroup {
  title: string;
  links: FooterLink[];
}

export const projects: Project[] = [
  { id: 'p1', name: 'Çekirdek API v2', active: true },
  { id: 'p2', name: 'Önyüz Yenileme', active: false },
  { id: 'p3', name: 'Mobil Uygulama Senkronizasyonu', active: false },
];

export const kanbanColumns: KanbanColumn[] = [
  {
    id: 'todo',
    title: 'Yapılacaklar',
    tasks: [
      { id: 't1', title: 'OAuth2 Akışını Uygula', priority: 'High', assignee: 'Görkem' },
      { id: 't2', title: 'Veritabanı Sorgularını İyileştir', priority: 'Medium', assignee: 'Can' },
    ],
  },
  {
    id: 'in-progress',
    title: 'Devam Ediyor',
    tasks: [
      {
        id: 't3',
        title: 'Context Durum Yönetimini Yeniden Düzenle',
        priority: 'High',
        assignee: 'Görkem',
      },
    ],
  },
  {
    id: 'done',
    title: 'Tamamlandı',
    tasks: [
      {
        id: 't4',
        title: 'Supabase Gerçek Zamanlı Özelliğini Kur',
        priority: 'Critical',
        assignee: 'Görkem',
      },
    ],
  },
];

export const milestones: Milestone[] = [
  { title: '1. Sprint Teslimi', date: '2026-07-15', status: 'on-track' },
  { title: 'Beta Testi Başlangıcı', date: '2026-08-01', status: 'pending' },
];

export const features: FeatureItem[] = [
  {
    id: 'f1',
    icon: 'kanban',
    title: 'Yoğun Bilgili Kanban',
    description:
      'Hızlı kaydırılan sütunlar, çoklu seçimle sürükle-bırak ve öncelik kodlu kenarlıklar. En yüksek bilgi yoğunluğu ve hızlı etkileşim için tasarlandı.',
    size: 'large',
  },
  {
    id: 'f2',
    icon: 'message',
    title: 'Bağlama Özel Mesajlaşma',
    description:
      'Görevlere doğrudan bağlı konu dizileri. Sonsuz genel sohbet kanallarında bağlamı bir daha asla kaybetmeyin.',
    size: 'small',
  },
  {
    id: 'f3',
    icon: 'shield',
    title: 'Ayrıntılı Erişim Denetimi',
    description:
      'Kurumsal düzeyde izin yapıları. Rolleri kesin biçimde tanımlayın, dış yüklenicileri güvenle yönetin ve hassas stratejik çalışmaları koruyun.',
    size: 'full-width',
    badges: ['RBAC', 'SSO'],
  },
];

export const workflowSteps: WorkflowStep[] = [
  {
    stepNumber: 1,
    title: 'Yakala',
    description: 'Klavye kısayollarıyla görevleri hızla kaydedin.',
  },
  { stepNumber: 2, title: 'Düzenle', description: 'Projelerde sıralayın ve öncelikler atayın.' },
  {
    stepNumber: 3,
    title: 'Uygula',
    description: 'Odak modu dikkat dağıtıcıları ortadan kaldırır.',
  },
  { stepNumber: 4, title: 'İncele', description: 'Takım hızı için otomatik raporlar alın.' },
];

export const footerGroups: FooterGroup[] = [
  {
    title: 'Ürün',
    links: [
      { label: 'Özellikler', url: '#features' },
      { label: 'Fiyatlandırma', url: '#pricing' },
      { label: 'Entegrasyonlar', url: '#integrations' },
    ],
  },
  {
    title: 'Şirket',
    links: [
      { label: 'Hakkımızda', url: '#about' },
      { label: 'Blog', url: '#blog' },
      { label: 'İletişim', url: '#contact' },
    ],
  },
];

export const legalLinks: FooterLink[] = [
  { label: 'Gizlilik Politikası', url: '/privacy' },
  { label: 'Kullanım Koşulları', url: '/terms' },
];

export const copyright = '© 2026 TaskFlow Inc. Tüm hakları saklıdır.';
