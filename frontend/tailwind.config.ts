import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        card: {
          DEFAULT: 'var(--color-card)',
          foreground: 'var(--color-card-foreground)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
        },
        ring: 'var(--color-ring)',
        secondary: {
          DEFAULT: 'var(--color-secondary)',
          foreground: 'var(--color-secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--color-muted)',
          foreground: 'var(--color-muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          foreground: 'var(--color-accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--color-popover)',
          foreground: 'var(--color-popover-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--color-destructive)',
          foreground: 'var(--color-destructive-foreground)',
        },
        border: 'var(--color-border)',
        input: 'var(--color-input)',
        priority: {
          high: 'var(--color-priority-high)',
          medium: 'var(--color-priority-medium)',
          low: 'var(--color-priority-low)',
        },
        status: {
          todo: 'var(--color-status-todo)',
          inprogress: 'var(--color-status-inprogress)',
          done: 'var(--color-status-done)',
        },
      },
      fontFamily: {
        display: ['Inter', 'DM Sans', 'sans-serif'],
        body: ['Inter', 'DM Sans', 'sans-serif'],
        ui: ['Inter', 'DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['15px', { lineHeight: '22px' }],
        lg: ['18px', { lineHeight: '26px' }],
        xl: ['22px', { lineHeight: '30px' }],
        '2xl': ['28px', { lineHeight: '36px' }],
        '4xl': ['40px', { lineHeight: '48px' }],
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        6: '24px',
        8: '32px',
        12: '48px',
        16: '64px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        panel: '0 4px 12px rgba(0,0,0,0.5)',
        modal: '0 8px 32px rgba(0,0,0,0.6)',
        widget: '0 6px 20px rgba(0,0,0,0.55)',
      },
    },
  },
  plugins: [],
};

export default config;
