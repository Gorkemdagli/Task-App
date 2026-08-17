export type DemoView = 'board' | 'tasks';
export type DemoMode = 'guided' | 'manual';
export type DemoStatus = 'todo' | 'in-progress' | 'done';
export type DemoPriority = 'critical' | 'high' | 'medium' | 'low';
export type DemoBeat = 0 | 1 | 2;

export interface DemoTeam {
  id: string;
  name: string;
}

export interface DemoTask {
  id: string;
  teamId: string;
  title: string;
  assignee: string;
  priority: DemoPriority;
  status: DemoStatus;
  deadline: string;
}

export interface DemoState {
  mode: DemoMode;
  activeBeat: DemoBeat;
  activeTeamId: string;
  view: DemoView;
  selectedTaskId: string | null;
  tasks: DemoTask[];
}

export type DemoAction =
  | { type: 'apply-guided-beat'; beat: DemoBeat }
  | { type: 'select-team'; teamId: string }
  | { type: 'set-view'; view: DemoView }
  | { type: 'select-task'; taskId: string | null }
  | { type: 'move-task'; taskId: string; status: DemoStatus }
  | { type: 'reset' };

export const demoTeams: readonly DemoTeam[] = [
  { id: 'team-platform', name: 'Platform Takımı' },
  { id: 'team-product', name: 'Ürün Takımı' },
];

const demoTaskFixture: readonly DemoTask[] = [
  {
    id: 'task-auth-flow',
    teamId: 'team-platform',
    title: 'OAuth akışı',
    assignee: 'Görkem Kaya',
    priority: 'high',
    status: 'todo',
    deadline: '2026-08-22',
  },
  {
    id: 'task-rate-limit',
    teamId: 'team-platform',
    title: 'API rate limitini doğrula',
    assignee: 'Selin Demir',
    priority: 'critical',
    status: 'in-progress',
    deadline: '2026-08-20',
  },
  {
    id: 'task-theme-contrast',
    teamId: 'team-platform',
    title: 'Tema kontrastını kontrol et',
    assignee: 'Can Yılmaz',
    priority: 'medium',
    status: 'done',
    deadline: '2026-08-18',
  },
  {
    id: 'task-notification-panel',
    teamId: 'team-product',
    title: 'Bildirim panelini sadeleştir',
    assignee: 'Derya Akın',
    priority: 'medium',
    status: 'todo',
    deadline: '2026-08-25',
  },
  {
    id: 'task-mobile-board',
    teamId: 'team-product',
    title: 'Mobil kanbanı test et',
    assignee: 'Mert Kaya',
    priority: 'high',
    status: 'in-progress',
    deadline: '2026-08-23',
  },
  {
    id: 'task-permission-matrix',
    teamId: 'team-product',
    title: 'Yetki matrisini gözden geçir',
    assignee: 'Ece Arslan',
    priority: 'low',
    status: 'done',
    deadline: '2026-08-19',
  },
];

export function createInitialDemoState(): DemoState {
  return {
    mode: 'guided',
    activeBeat: 0,
    activeTeamId: demoTeams[0].id,
    view: 'board',
    selectedTaskId: null,
    tasks: demoTaskFixture.map((task) => ({ ...task })),
  };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'apply-guided-beat': {
      if (state.mode === 'manual') return state;

      const guidedState = createInitialDemoState();

      if (action.beat === 0) return guidedState;

      return {
        ...guidedState,
        activeBeat: action.beat,
        view: action.beat === 2 ? 'tasks' : 'board',
        selectedTaskId: 'task-auth-flow',
        tasks: guidedState.tasks.map((task) =>
          task.id === 'task-auth-flow' ? { ...task, status: 'in-progress' } : task,
        ),
      };
    }

    case 'select-team':
      if (!demoTeams.some((team) => team.id === action.teamId)) return state;
      return {
        ...state,
        mode: 'manual',
        activeTeamId: action.teamId,
        selectedTaskId: null,
      };

    case 'set-view':
      return { ...state, mode: 'manual', view: action.view };

    case 'select-task':
      if (
        action.taskId !== null &&
        !state.tasks.some((task) => task.id === action.taskId && task.teamId === state.activeTeamId)
      ) {
        return state;
      }
      return { ...state, mode: 'manual', selectedTaskId: action.taskId };

    case 'move-task':
      if (!state.tasks.some((task) => task.id === action.taskId)) return state;
      return {
        ...state,
        mode: 'manual',
        tasks: state.tasks.map((task) =>
          task.id === action.taskId ? { ...task, status: action.status } : task,
        ),
      };

    case 'reset':
      return createInitialDemoState();
  }
}
