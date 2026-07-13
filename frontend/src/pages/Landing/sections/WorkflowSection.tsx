import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { workflowSteps } from '@/pages/Landing/data/mockData';

export function WorkflowSection() {
  return (
    <section
      id="workflow"
      aria-labelledby="workflow-title"
      className="flex min-h-screen flex-col justify-center bg-landing-bg-alt py-12 md:py-20"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-10 px-4 md:gap-12 md:px-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <h2
            id="workflow-title"
            className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl"
          >
            The Workflow
          </h2>
          <p className="max-w-xl text-landing-muted md:text-lg">
            Four steps from scattered thought to shipped work.
          </p>
        </header>

        {/* Steps wrapped in one box, arrows between them.
            On lg+ layout is horizontal (right arrows). Below lg, stack
            vertical (down arrows via rotate-90). */}
        <div className="w-full rounded-lg border border-landing-border bg-landing-card p-6 shadow-panel md:p-10">
          <ol className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-stretch lg:gap-0">
            {workflowSteps.map((step, i) => (
              <Fragment key={step.stepNumber}>
                <li className="flex flex-1 flex-col items-start gap-3 lg:items-center lg:text-center">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-landing-primary-soft text-base font-bold text-landing-primary"
                    aria-hidden
                  >
                    {step.stepNumber}
                  </div>
                  <h4 className="text-base font-semibold tracking-tight md:text-lg">
                    {step.title}
                  </h4>
                  <p className="text-sm leading-relaxed text-landing-muted lg:max-w-[180px]">
                    {step.description}
                  </p>
                </li>
                {i < workflowSteps.length - 1 && (
                  <li aria-hidden className="flex items-center justify-center text-landing-primary">
                    <ArrowRight className="h-6 w-6 rotate-90 lg:rotate-0" />
                  </li>
                )}
              </Fragment>
            ))}
          </ol>
        </div>

        {/* Closing copy + CTA */}
        <div className="mt-2 flex max-w-2xl flex-col items-center gap-4 text-center md:mt-4">
          <p className="text-sm leading-relaxed text-landing-muted md:text-base">
            Built for engineers who hate ceremony. Capture with shortcuts, organize without drag,
            execute without distractions, and review with automated velocity reports.
          </p>
          <Link to="/register" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            Start your free trial
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
