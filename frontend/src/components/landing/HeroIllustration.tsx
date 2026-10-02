import {
  CalendarDays,
  ChevronLeft,
  FileText,
  LayoutDashboard,
  ListTodo,
  MessageCircle,
  Search,
  Send,
  Settings,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function HeroIllustration() {
  const { t } = useTranslation();
  return (
    <div className="landing-hero-illustration">
      <div className="landing-hero-board" role="img" aria-label={t('landing.illustration.preview')}>
        <div className="landing-hero-app">
          <div className="landing-hero-app__chrome" aria-hidden>
            <span className="landing-hero-app__chrome-dot" />
            <span className="landing-hero-app__chrome-dot" />
            <span className="landing-hero-app__chrome-dot" />
          </div>
          <aside className="landing-hero-app__sidebar" aria-hidden>
            <strong className="landing-hero-app__brand">TaskFlow</strong>
            <nav>
              <span className="is-active">
                <LayoutDashboard aria-hidden /> {t('landing.illustration.boards')}
              </span>
              <span>
                <ListTodo aria-hidden /> {t('landing.illustration.tasks')}
              </span>
              <span>
                <CalendarDays aria-hidden /> {t('landing.illustration.calendar')}
              </span>
              <span>
                <MessageCircle aria-hidden /> {t('landing.illustration.messages')}
              </span>
              <span>
                <FileText aria-hidden /> {t('landing.illustration.files')}
              </span>
              <span>
                <Users aria-hidden /> {t('landing.illustration.team')}
              </span>
              <span>
                <Settings aria-hidden /> {t('landing.illustration.settings')}
              </span>
            </nav>
            <div className="landing-hero-app__workspace">
              <small>{t('landing.illustration.workspace')}</small>
              <span>
                <b>P</b> {t('landing.illustration.marketingTeam')}
              </span>
            </div>
          </aside>

          <div className="landing-hero-app__main">
            <div className="landing-hero-board__topbar" aria-hidden>
              <strong>{t('landing.illustration.productLaunch')}</strong>
              <span className="landing-hero-board__search">
                <Search aria-hidden /> {t('landing.illustration.search')}
              </span>
              <span className="landing-hero-board__avatars">
                <i />
                <i />
                <i />
                <span>+</span>
              </span>
              <b>{t('landing.illustration.addTask')}</b>
            </div>

            <div className="landing-hero-board__toolbar" aria-hidden>
              <div className="landing-hero-board__toolbar-main">
                <strong>{t('landing.illustration.productLaunch')}</strong>
                <div className="landing-hero-board__toolbar-nav">
                  <span className="is-active">{t('landing.illustration.board')}</span>
                  <span>{t('landing.illustration.list')}</span>
                  <span>{t('landing.illustration.calendar')}</span>
                </div>
              </div>
              <span>•••</span>
            </div>

            <div className="landing-hero-app__body">
              <div className="landing-hero-app__board">
                <div
                  className="landing-hero-board__columns landing-hero-board__columns--lifecycle"
                  aria-hidden
                >
                  <div className="landing-hero-board__column">
                    <header>
                      <span>{t('landing.workflow.todo')}</span>
                      <span>2</span>
                    </header>
                    <div className="landing-hero-board__task landing-hero-board__task--quiet">
                      <strong>{t('landing.illustration.websocket')}</strong>
                      <span>SD</span>
                    </div>
                    <div className="landing-hero-board__task landing-hero-board__task--quiet">
                      <strong>{t('landing.illustration.api')}</strong>
                      <span>GK</span>
                    </div>
                  </div>

                  <div className="landing-hero-board__column">
                    <header>
                      <span>{t('landing.workflow.doing')}</span>
                      <span>1</span>
                    </header>
                    <div className="landing-hero-board__task landing-hero-board__task--selected">
                      <strong>{t('landing.illustration.taskDemoTitle')}</strong>
                      <span>DA</span>
                    </div>
                    <article className="landing-hero-board__task landing-hero-board__task--extra">
                      <strong>{t('landing.illustration.campaignPlan')}</strong>
                      <span>DA</span>
                    </article>
                    <article className="landing-hero-board__task landing-hero-board__task--extra">
                      <strong>{t('landing.illustration.emailDraft')}</strong>
                      <span>DA</span>
                    </article>
                  </div>

                  <div className="landing-hero-board__column landing-hero-board__column--done">
                    <header>
                      <span>{t('landing.workflow.done')}</span>
                      <span>1</span>
                    </header>
                    <div className="landing-hero-board__task landing-hero-board__task--quiet">
                      <strong>{t('landing.illustration.videoReady')}</strong>
                      <span>DA</span>
                    </div>
                    <article className="landing-hero-board__task landing-hero-board__task--extra">
                      <strong>{t('landing.illustration.launchAnalysis')}</strong>
                      <span>DA</span>
                    </article>
                  </div>

                  <div className="landing-hero-board__column--archive">
                    <div className="landing-hero-board__archive">
                      <div className="landing-hero-board__archive-visual">
                        <strong className="landing-hero-board__archive-count">+1</strong>
                        <svg
                          className="landing-hero-board__archive-illustration"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M4 7.9966C3.83599 7.99236 3.7169 7.98287 3.60982 7.96157C2.81644 7.80376 2.19624 7.18356 2.03843 6.39018C2 6.19698 2 5.96466 2 5.5C2 5.03534 2 4.80302 2.03843 4.60982C2.19624 3.81644 2.81644 3.19624 3.60982 3.03843C3.80302 3 4.03534 3 4.5 3H19.5C19.9647 3 20.197 3 20.3902 3.03843C21.1836 3.19624 21.8038 3.81644 21.9616 4.60982C22 4.80302 22 5.03534 22 5.5C22 5.96466 22 6.19698 21.9616 6.39018C21.8038 7.18356 21.1836 7.80376 20.3902 7.96157C20.2831 7.98287 20.164 7.99236 20 7.9966M10 13H14M4 8H20V16.2C20 17.8802 20 18.7202 19.673 19.362C19.3854 19.9265 18.9265 20.3854 18.362 20.673C17.7202 21 16.8802 21 15.2 21H8.8C7.11984 21 6.27976 21 5.63803 20.673C5.07354 20.3854 4.6146 19.9265 4.32698 19.362C4 18.7202 4 17.8802 4 16.2V8Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                <span className="landing-hero-board__archive-label">{t('landing.illustration.archive')}</span>
                    </div>
                  </div>
                </div>

                <div className="landing-hero-board__proof" aria-hidden>
                  <div className="landing-hero-board__proof-pane">
                    <span>{t('landing.illustration.taskDetails')}</span>
                    <strong>{t('landing.features.taskTitle')}</strong>
                    <small>{t('landing.illustration.taskAssignee')}</small>
                  </div>
                  <div className="landing-hero-board__proof-pane landing-hero-board__proof-pane--conversation">
                    <span>{t('landing.features.conversation')}</span>
                    <p>{t('landing.illustration.dependencyResolved')}</p>
                    <p>{t('landing.illustration.deadlineClear')}</p>
                  </div>
                </div>
              </div>

              <aside className="landing-hero-board__inspector" aria-hidden>
                <div className="landing-hero-board__inspector-close">×</div>
                <div className="landing-hero-board__inspector-title">
                  <h3>{t('landing.illustration.taskDemoTitle')}</h3>
                  <span>•••</span>
                </div>
                <div className="landing-hero-board__inspector-status">
                  <span className="landing-hero-board__status-chip">
                    <i /> {t('landing.illustration.statusDoing')}
                  </span>
                  <span className="landing-hero-board__meta-chip">{t('landing.illustration.production')}</span>
                  <time>{t('landing.illustration.date')}</time>
                </div>
                <div className="landing-hero-board__inspector-section">
                  <strong>{t('landing.illustration.description')}</strong>
                  <p>
                    {t('landing.illustration.videoDescription')}
                  </p>
                </div>
                <div className="landing-hero-board__inspector-section">
                  <strong>{t('landing.illustration.assignee')}</strong>
                  <div className="landing-hero-board__inspector-person">
                    <span className="landing-hero-board__avatar">DA</span>
                    <b>{t('landing.illustration.assigneeName')}</b>
                  </div>
                </div>
                <div className="landing-hero-board__inspector-section">
                  <strong>{t('landing.illustration.tags')}</strong>
                  <div className="landing-hero-board__inspector-tags">
                    <span>{t('landing.illustration.production')}</span>
                    <span>+</span>
                  </div>
                </div>
                <div className="landing-hero-board__attachment">
                  <strong>{t('landing.illustration.attachments')}</strong>
                  <span>
                    <FileText aria-hidden />
                    <b>{t('landing.illustration.fileName')}</b>
                    <small>743 KB</small>
                    <i>•••</i>
                  </span>
                  <small>{t('landing.illustration.addFile')}</small>
                </div>
                <div className="landing-hero-board__inspector-comments">
                  <strong>
                    {t('landing.illustration.comments')} <span>4</span>
                    <ChevronLeft aria-hidden />
                  </strong>
                  <p>
                    <span className="landing-hero-board__avatar">DA</span>
                    <span>
                      <b>
                        Deniz Arslan <time>{t('landing.illustration.firstCommentDate')}</time>
                      </b>
                      {t('landing.illustration.firstComment')}
                    </span>
                  </p>
                  <p>
                    <span className="landing-hero-board__avatar">MK</span>
                    <span>
                      <b>
                        Mert Kaya <time>{t('landing.illustration.secondCommentDate')}</time>
                      </b>
                      {t('landing.illustration.secondComment')}
                    </span>
                  </p>
                  <p>
                    <span className="landing-hero-board__avatar">İD</span>
                    <span>
                      <b>
                        İrem Demir <time>{t('landing.illustration.thirdCommentDate')}</time>
                      </b>
                      {t('landing.illustration.thirdComment')}
                    </span>
                  </p>
                  <p>
                    <span className="landing-hero-board__avatar">SK</span>
                    <span>
                      <b>
                        Selin Kılıç <time>{t('landing.illustration.fourthCommentDate')}</time>
                      </b>
                      {t('landing.illustration.fourthComment')}
                    </span>
                  </p>
                  <span className="landing-hero-board__comment-input">
                    <span className="landing-hero-board__avatar">DA</span>
                    <span>{t('landing.illustration.writeComment')}</span>
                    <Send aria-hidden />
                  </span>
                </div>
              </aside>
            </div>
          </div>
        </div>

        <span className="landing-hero-board__link" aria-hidden>
          {t('landing.illustration.preview')}
        </span>
      </div>
    </div>
  );
}
