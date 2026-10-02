import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  LayoutDashboard,
  MessageCircle,
} from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { createLandingMotion } from '../motion/createLandingMotion';
import './MotionSection.css';

gsap.registerPlugin(useGSAP);

export function MotionSection() {
  const { t } = useTranslation();
  const scope = useRef<HTMLElement>(null);
  const statement = t('landing.workflow.statement');
  const steps = [
    { title: t('landing.workflow.step1Title'), copy: t('landing.workflow.step1Copy') },
    { title: t('landing.workflow.step2Title'), copy: t('landing.workflow.step2Copy') },
    { title: t('landing.workflow.step3Title'), copy: t('landing.workflow.step3Copy') },
    { title: t('landing.workflow.step4Title'), copy: t('landing.workflow.step4Copy') },
    { title: t('landing.workflow.step5Title'), copy: t('landing.workflow.step5Copy') },
  ];

  useGSAP(
    () => {
      if (!scope.current) return;
      return createLandingMotion(scope.current);
    },
    { scope },
  );

  return (
    <section
      ref={scope}
      id="workflow"
      aria-labelledby="motion-title"
      className="landing-motion workflow-redesign"
    >
      <span className="workflow-snap-anchor" aria-hidden="true" />
      <div className="landing-section-shell">
        <div className="landing-lifecycle-intro">
          <h2 id="motion-title" aria-label={t('landing.workflow.headline')}>
            {t('landing.workflow.headlineFirst')} <br />
            <span className="landing-lifecycle-heading-line--wide">{t('landing.workflow.headlineSecond')}</span>
          </h2>
          <div className="landing-lifecycle-intro__aside">
            <p>
              {statement}
            </p>
          </div>
        </div>

        <p className="landing-lifecycle-statement" aria-label={statement}>
          {statement.split(' ').map((word, index) => (
            <span key={`${word}-${index}`} data-motion-word aria-hidden>
              {word}{' '}
            </span>
          ))}
        </p>

        <div className="workflow-story" data-testid="lifecycle-ribbon">
          <ol className="workflow-steps" aria-label={t('landing.workflow.stepsLabel')}>
            {steps.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </li>
            ))}
          </ol>

          <div className="workflow-window">
            <header className="workflow-toolbar">
              <span>
                <LayoutDashboard aria-hidden />
                <strong>{t('landing.workflow.productTeam')}</strong>
                <span className="workflow-toolbar-divider">/</span>{t('landing.workflow.tasks')}
              </span>
              <small>{t('landing.workflow.workspace')}</small>
            </header>
            <div className="workflow-workspace">
              <article className="workflow-board" data-motion-frame aria-label={t('landing.workflow.boardCreated')}>
                <div className="workflow-board-title">
                  <h3>{t('landing.workflow.boardHeadline')}</h3>
                  <span>{t('landing.workflow.boardView')}</span>
                </div>
                <div className="workflow-columns">
                  <div className="workflow-column">
                    <h4>
                      <Circle aria-hidden />
                      {t('landing.workflow.todo')}<span>2</span>
                    </h4>
                    <div className="workflow-card">
                      <small>{t('landing.workflow.boardCreated')}</small>
                      <strong>{t('landing.workflow.notificationPreferences')}</strong>
                      <p>{t('landing.workflow.importantUpdates')}</p>
                      <div className="workflow-card-meta">
                        <span className="workflow-avatar" aria-hidden>
                          MK
                        </span>
                        <span>Mert Kaya</span>
                      </div>
                    </div>
                    <div className="workflow-card workflow-card--quiet">
                      <strong>{t('landing.workflow.reviewCurrentFlow')}</strong>
                      <div className="workflow-card-meta">
                        <CalendarDays aria-hidden />
                        <span>{t('landing.workflow.reviewDate')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="workflow-column">
                    <h4>
                      <Circle aria-hidden />
                      {t('landing.workflow.doing')}<span>1</span>
                    </h4>
                    <div className="workflow-card workflow-card--selected">
                      <small>
                        {t('landing.workflow.selectedTask')} <ArrowRight aria-hidden />
                      </small>
                      <strong>{t('landing.features.taskTitle')}</strong>
                      <p>{t('landing.workflow.selectedTaskCopy')}</p>
                      <div className="workflow-card-meta">
                        <span className="workflow-avatar" aria-hidden>
                          ZY
                        </span>
                        <span>Zeynep Yılmaz</span>
                        <MessageCircle aria-hidden />
                      </div>
                    </div>
                  </div>
                  <div className="workflow-column">
                    <h4>
                      <CheckCircle2 aria-hidden />
                      {t('landing.workflow.done')}<span>1</span>
                    </h4>
                    <div className="workflow-card workflow-card--quiet">
                      <small>{t('landing.workflow.completed')}</small>
                      <strong>{t('landing.workflow.editNotificationText')}</strong>
                      <div className="workflow-card-meta">
                        <span className="workflow-avatar" aria-hidden>
                          MK
                        </span>
                        <span>Mert Kaya</span>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article
                className="workflow-detail is-active"
                data-motion-frame
                aria-label={t('landing.workflow.selectedTaskDetails')}
              >
                <header>
                  <span>TASK-2847</span>
                  <span className="workflow-status">{t('landing.workflow.doing')}</span>
                </header>
                <h3>{t('landing.features.taskTitle')}</h3>
                <p>{t('landing.workflow.editNotificationCopy')}</p>
                <dl>
                  <div>
                    <dt>{t('landing.workflow.assignee')}</dt>
                    <dd>Zeynep Yılmaz</dd>
                  </div>
                  <div>
                    <dt>{t('landing.workflow.dueDate')}</dt>
                    <dd>
                      <CalendarDays aria-hidden />
                      {t('landing.workflow.dueDateValue')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('landing.workflow.priority')}</dt>
                    <dd>{t('landing.workflow.high')}</dd>
                  </div>
                </dl>
                <div className="workflow-comments">
                  <h4>
                    <MessageCircle aria-hidden />
                    {t('landing.workflow.comments')}<span>{t('landing.workflow.commentCount')}</span>
                  </h4>
                  <div>
                    <span className="workflow-avatar" aria-hidden>
                      MK
                    </span>
                    <p>
                      <strong>Mert Kaya</strong>{t('landing.workflow.firstComment')}
                    </p>
                  </div>
                  <div>
                    <span className="workflow-avatar" aria-hidden>
                      ZY
                    </span>
                    <p>
                      <strong>Zeynep Yılmaz</strong>{t('landing.workflow.secondComment')}
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <article className="workflow-archive">
            <span className="workflow-archive-icon">
              <Archive aria-hidden />
            </span>
            <div>
              <h3>{t('landing.workflow.archiveHeadline')}</h3>
              <p>{t('landing.workflow.archiveCopy')}</p>
            </div>
            <span className="workflow-archive-state">
              <CheckCircle2 aria-hidden />
              {t('landing.workflow.archived')}
            </span>
          </article>
        </div>
      </div>
    </section>
  );
}
