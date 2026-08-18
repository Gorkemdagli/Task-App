import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-black hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-card',
        ghost: 'hover:bg-secondary',
        destructive: 'bg-priority-high text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), 'relative', className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        <span
          className={cn(
            'inline-flex items-center justify-center gap-2 transition-opacity',
            loading && 'opacity-0',
          )}
        >
          {children}
        </span>
        {loading && (
          <span
            className="absolute inset-0 inline-flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          </span>
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
