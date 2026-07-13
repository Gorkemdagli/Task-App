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
  { id: 'p1', name: 'Core API v2', active: true },
  { id: 'p2', name: 'Frontend Overhaul', active: false },
  { id: 'p3', name: 'Mobile App Sync', active: false },
];

export const kanbanColumns: KanbanColumn[] = [
  {
    id: 'todo',
    title: 'Backlog',
    tasks: [
      { id: 't1', title: 'Implement OAuth2 Flow', priority: 'High', assignee: 'Görkem' },
      { id: 't2', title: 'Optimize Database Queries', priority: 'Medium', assignee: 'Can' },
    ],
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    tasks: [
      { id: 't3', title: 'Refactor Context State Mngmt', priority: 'High', assignee: 'Görkem' },
    ],
  },
  {
    id: 'done',
    title: 'Done',
    tasks: [
      { id: 't4', title: 'Setup Supabase Realtime', priority: 'Critical', assignee: 'Görkem' },
    ],
  },
];

export const milestones: Milestone[] = [
  { title: 'Sprint 1 Delivery', date: '2026-07-15', status: 'on-track' },
  { title: 'Beta Testing Launch', date: '2026-08-01', status: 'pending' },
];

export const features: FeatureItem[] = [
  {
    id: 'f1',
    icon: 'kanban',
    title: 'High-Density Kanban',
    description:
      'Snap-scroll columns, multi-select drag & drop, and priority-coded borders. Designed for maximum information density and rapid interaction.',
    size: 'large',
  },
  {
    id: 'f2',
    icon: 'message',
    title: 'Contextual Messaging',
    description:
      'Threaded discussions attached directly to tasks. Never lose context in endless generic chat channels again.',
    size: 'small',
  },
  {
    id: 'f3',
    icon: 'shield',
    title: 'Granular Access Control',
    description:
      'Enterprise-grade permission structures. Define roles precisely, manage external contractors safely, and keep sensitive strategic initiatives locked down.',
    size: 'full-width',
    badges: ['RBAC', 'SSO'],
  },
];

export const workflowSteps: WorkflowStep[] = [
  { stepNumber: 1, title: 'Capture', description: 'Quickly log tasks via keyboard shortcuts.' },
  { stepNumber: 2, title: 'Organize', description: 'Sort into projects and assign priorities.' },
  { stepNumber: 3, title: 'Execute', description: 'Focus mode strips away distractions.' },
  { stepNumber: 4, title: 'Review', description: 'Automated reporting on team velocity.' },
];

export const footerGroups: FooterGroup[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', url: '#features' },
      { label: 'Pricing', url: '#pricing' },
      { label: 'Integrations', url: '#integrations' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', url: '#about' },
      { label: 'Blog', url: '#blog' },
      { label: 'Contact', url: '#contact' },
    ],
  },
];

export const legalLinks: FooterLink[] = [
  { label: 'Privacy Policy', url: '/privacy' },
  { label: 'Terms of Service', url: '/terms' },
];

export const copyright = '© 2026 TaskFlow Inc. All rights reserved.';
