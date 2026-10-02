import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  KeyRound,
  MessageCircle,
  Send,
  Users,
} from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { createFeatureMotion } from '../motion/createFeatureMotion';

gsap.registerPlugin(useGSAP);

export function FeaturesSection() {
  const { t } = useTranslation();
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!scope.current) return;
      return createFeatureMotion(scope.current);
    },
    { scope },
  );

  return (
    <section
      ref={scope}
      id="features"
      aria-labelledby="features-title"
      className="landing-features"
    >
      <div className="landing-section-shell">
        <div className="landing-context-layout">
          <div className="landing-context-copy">
            <p className="landing-context-kicker">{t('landing.features.kicker')}</p>
            <h2 id="features-title" aria-label={t('landing.features.headline')}>
              {t('landing.features.headlineFirst')} <br />
              {t('landing.features.headlineSecond')}
            </h2>
            <p className="landing-context-lede">
              {t('landing.features.lede')}
            </p>

            <div className="landing-context-proof-row" aria-label={t('landing.features.principles')}>
              <span>
                <Users aria-hidden />
                <strong>{t('landing.features.allTeams')}</strong>
                <small>{t('landing.features.oneWorkspace')}</small>
              </span>
              <span>
                <Building2 aria-hidden />
                <strong>{t('landing.features.growingOrganizations')}</strong>
                <small>{t('landing.features.suitableStructure')}</small>
              </span>
              <span>
                <KeyRound aria-hidden />
                <strong>{t('landing.features.dataSafe')}</strong>
                <small>{t('landing.features.controlYours')}</small>
              </span>
            </div>
          </div>

          <div data-testid="feature-bento" className="landing-context-map">
            <div className="landing-context-tether" data-testid="context-tether">
              <svg
                className="landing-context-connectors"
                data-testid="context-connectors"
                viewBox="0 0 800 566"
                preserveAspectRatio="none"
                aria-hidden
              >
                <defs>
                  <marker
                    id="landing-context-arrowhead"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                </defs>
                <path data-connection="owner" d="M232 88 H252 Q272 88 272 108 V170" />
                <path data-connection="team" d="M448 170 V112 Q448 88 472 88 H520" />
                <path
                  data-connection="conversation"
                  d="M504 288 H520 Q536 288 544 304 Q548 312 560 312"
                />
                <path
                  data-connection="permission"
                  d="M164 340 V402 Q164 422 144 422 H122 Q102 422 102 442 V480"
                />
                <path
                  data-connection="deadline"
                  d="M384 340 V402 Q384 422 404 422 H428 Q448 422 448 442 V480"
                />
                <path
                  data-connection="annotation"
                  className="landing-context-connectors__annotation"
                  d="M368 58 C374 92 365 116 344 132"
                  markerEnd="url(#landing-context-arrowhead)"
                />
              </svg>
              <div className="landing-context-annotation" aria-hidden>
                {t('landing.features.annotationFirst')}
                <br />
                {t('landing.features.annotationSecond')}
              </div>

              <article
                className="landing-context-node landing-context-node--owner"
                data-context-node
                data-feature-reveal
              >
                <Users aria-hidden />
                <div>
                  <strong>{t('landing.features.owner')}</strong>
                  <b>Zeynep Arslan</b>
                  <small>{t('landing.features.ownerRole')}</small>
                </div>
              </article>

              <article
                className="landing-context-node landing-context-node--team"
                data-context-node
                data-feature-reveal
              >
                <Building2 aria-hidden />
                <div>
                  <strong>{t('landing.features.team')}</strong>
                  <b>{t('landing.features.teamName')}</b>
                  <small>{t('landing.features.teamArea')}</small>
                </div>
                <ArrowRight aria-hidden />
              </article>

              <article className="landing-context-task" aria-label={t('landing.features.centralTask')}>
                <header>
                  <span>TASK-2847</span>
                  <span className="landing-context-status">{t('landing.features.taskStatus')}</span>
                </header>
                <h3>{t('landing.features.taskTitle')}</h3>
                <p>{t('landing.features.taskCopy')}</p>
                <div className="landing-context-task__tags">
                  <span>{t('landing.features.tagNotifications')}</span>
                  <span>{t('landing.features.tagUserExperience')}</span>
                  <span>{t('landing.features.tagPlatform')}</span>
                  <span aria-label={t('landing.features.addTag')}>+</span>
                </div>
              </article>

              <article
                className="landing-context-node landing-context-node--conversation landing-context-conversation"
                data-context-node
                data-feature-reveal
              >
                <MessageCircle aria-hidden />
                <div>
                  <strong>{t('landing.features.conversation')}</strong>
                </div>
                <div className="landing-context-message-list">
                  <div>
                    <span aria-hidden>MK</span>
                    <p>
                      <b>Mert Kaya</b>
                      <time>{t('landing.features.todayFirst')}</time>
                      <small>{t('landing.features.messageFirst')}</small>
                    </p>
                  </div>
                  <div>
                    <span aria-hidden>ZA</span>
                    <p>
                      <b>Zeynep Arslan</b>
                      <time>{t('landing.features.todaySecond')}</time>
                      <small>{t('landing.features.messageSecond')}</small>
                    </p>
                  </div>
                  <span className="landing-context-message-input">
                    {t('landing.features.writeMessage')} <Send aria-hidden />
                  </span>
                </div>
              </article>

              <article
                className="landing-context-node landing-context-node--permission landing-context-permission"
                data-context-node
                data-feature-reveal
              >
                <KeyRound aria-hidden />
                <div>
                  <strong>{t('landing.features.permission')}</strong>
                  <b>{t('landing.features.permissionAction')}</b>
                  <small>{t('landing.features.permissionScope')}</small>
                </div>
                <ArrowRight aria-hidden />
              </article>

              <article className="landing-context-node landing-context-node--deadline">
                <CalendarDays aria-hidden />
                <div>
                  <strong>{t('landing.features.deadline')}</strong>
                  <b>{t('landing.features.deadlineDate')}</b>
                  <small>{t('landing.features.daysLeft')}</small>
                </div>
              </article>
            </div>
          </div>
        </div>

        <div className="landing-context-footer-line">
          <span>{t('landing.features.footerKicker')}</span>
          <p>{t('landing.features.footerCopy')}</p>
          <a href="#workflow">
            {t('landing.features.workflowQuestion')} <ArrowRight aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
