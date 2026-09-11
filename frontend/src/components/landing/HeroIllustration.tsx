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

export function HeroIllustration() {
  return (
    <div className="landing-hero-illustration">
      <div className="landing-hero-board" role="img" aria-label="TaskFlow çalışma alanı önizlemesi">
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
                <LayoutDashboard aria-hidden /> Panolar
              </span>
              <span>
                <ListTodo aria-hidden /> Görevler
              </span>
              <span>
                <CalendarDays aria-hidden /> Takvim
              </span>
              <span>
                <MessageCircle aria-hidden /> Mesajlar
              </span>
              <span>
                <FileText aria-hidden /> Dosyalar
              </span>
              <span>
                <Users aria-hidden /> Ekip
              </span>
              <span>
                <Settings aria-hidden /> Ayarlar
              </span>
            </nav>
            <div className="landing-hero-app__workspace">
              <small>ÇALIŞMA ALANI</small>
              <span>
                <b>P</b> Pazarlama Ekibi
              </span>
            </div>
          </aside>

          <div className="landing-hero-app__main">
            <div className="landing-hero-board__topbar" aria-hidden>
              <strong>Ürün Lansmanı</strong>
              <span className="landing-hero-board__search">
                <Search aria-hidden /> Görev, kişi veya etiket ara...
              </span>
              <span className="landing-hero-board__avatars">
                <i />
                <i />
                <i />
                <span>+</span>
              </span>
              <b>+ Görev ekle</b>
            </div>

            <div className="landing-hero-board__toolbar" aria-hidden>
              <div className="landing-hero-board__toolbar-main">
                <strong>Ürün Lansmanı</strong>
                <div className="landing-hero-board__toolbar-nav">
                  <span className="is-active">Pano</span>
                  <span>Liste</span>
                  <span>Takvim</span>
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
                      <span>Yapılacak</span>
                      <span>2</span>
                    </header>
                    <div className="landing-hero-board__task landing-hero-board__task--quiet">
                      <strong>WebSocket bağlantısını izle</strong>
                      <span>SD</span>
                    </div>
                    <div className="landing-hero-board__task landing-hero-board__task--quiet">
                      <strong>API sınırlarını doğrula</strong>
                      <span>GK</span>
                    </div>
                  </div>

                  <div className="landing-hero-board__column">
                    <header>
                      <span>Yapılıyor</span>
                      <span>1</span>
                    </header>
                    <div className="landing-hero-board__task landing-hero-board__task--selected">
                      <strong>Mobil uygulama için tanıtım videosu</strong>
                      <span>DA</span>
                    </div>
                    <article className="landing-hero-board__task landing-hero-board__task--extra">
                      <strong>Sosyal medya içerik planı</strong>
                      <span>DA</span>
                    </article>
                    <article className="landing-hero-board__task landing-hero-board__task--extra">
                      <strong>E-posta kampanyası taslağı</strong>
                      <span>DA</span>
                    </article>
                  </div>

                  <div className="landing-hero-board__column landing-hero-board__column--done">
                    <header>
                      <span>Yapıldı</span>
                      <span>1</span>
                    </header>
                    <div className="landing-hero-board__task landing-hero-board__task--quiet">
                      <strong>Arşivlenmeye hazır</strong>
                      <span>DA</span>
                    </div>
                    <article className="landing-hero-board__task landing-hero-board__task--extra">
                      <strong>Hedef kitle analizi</strong>
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
                      <span className="landing-hero-board__archive-label">Arşiv</span>
                    </div>
                  </div>
                </div>

                <div className="landing-hero-board__proof" aria-hidden>
                  <div className="landing-hero-board__proof-pane">
                    <span>Görev ayrıntısı</span>
                    <strong>Bildirim akışını sadeleştir</strong>
                    <small>Yapılıyor · Sorumlu: GK</small>
                  </div>
                  <div className="landing-hero-board__proof-pane landing-hero-board__proof-pane--conversation">
                    <span>Konuşma</span>
                    <p>Bağımlılık çözüldü.</p>
                    <p>Termin netleşti.</p>
                  </div>
                </div>
              </div>

              <aside className="landing-hero-board__inspector" aria-hidden>
                <div className="landing-hero-board__inspector-close">×</div>
                <div className="landing-hero-board__inspector-title">
                  <h3>Mobil uygulama için tanıtım videosu</h3>
                  <span>•••</span>
                </div>
                <div className="landing-hero-board__inspector-status">
                  <span className="landing-hero-board__status-chip">
                    <i /> Yapılıyor
                  </span>
                  <span className="landing-hero-board__meta-chip">Produksiyon</span>
                  <time>◷ 10 Eki</time>
                </div>
                <div className="landing-hero-board__inspector-section">
                  <strong>Açıklama</strong>
                  <p>
                    Uygulamanın temel faydalarını anlatan 60 saniyelik bir tanıtım videosu
                    hazırlayalım. Hedef kitle: KOBİ'ler.
                  </p>
                </div>
                <div className="landing-hero-board__inspector-section">
                  <strong>Sorumlu</strong>
                  <div className="landing-hero-board__inspector-person">
                    <span className="landing-hero-board__avatar">DA</span>
                    <b>Deniz Arslan</b>
                  </div>
                </div>
                <div className="landing-hero-board__inspector-section">
                  <strong>Etiketler</strong>
                  <div className="landing-hero-board__inspector-tags">
                    <span>Produksiyon</span>
                    <span>+</span>
                  </div>
                </div>
                <div className="landing-hero-board__attachment">
                  <strong>Ek dosyalar</strong>
                  <span>
                    <FileText aria-hidden />
                    <b>video-senaryo-v1.pdf</b>
                    <small>743 KB</small>
                    <i>•••</i>
                  </span>
                  <small>＋ Dosya ekle</small>
                </div>
                <div className="landing-hero-board__inspector-comments">
                  <strong>
                    Yorumlar <span>4</span>
                    <ChevronLeft aria-hidden />
                  </strong>
                  <p>
                    <span className="landing-hero-board__avatar">DA</span>
                    <span>
                      <b>
                        Deniz Arslan <time>8 Eki 10:24</time>
                      </b>
                      Senaryo taslağını ekledim, fikirlerinizi bekliyorum.
                    </span>
                  </p>
                  <p>
                    <span className="landing-hero-board__avatar">MK</span>
                    <span>
                      <b>
                        Mert Kaya <time>8 Eki 11:02</time>
                      </b>
                      Harika, birkaç sahne için alternatifler hazırlayacağım.
                    </span>
                  </p>
                  <p>
                    <span className="landing-hero-board__avatar">İD</span>
                    <span>
                      <b>
                        İrem Demir <time>8 Eki 14:37</time>
                      </b>
                      Müzik ve seslendirme tarafını da planlayalım.
                    </span>
                  </p>
                  <p>
                    <span className="landing-hero-board__avatar">SK</span>
                    <span>
                      <b>
                        Selin Kılıç <time>8 Eki 15:10</time>
                      </b>
                      Takvim bağlantısını da son kontrolden geçirelim.
                    </span>
                  </p>
                  <span className="landing-hero-board__comment-input">
                    <span className="landing-hero-board__avatar">DA</span>
                    <span>Yorum yaz...</span>
                    <Send aria-hidden />
                  </span>
                </div>
              </aside>
            </div>
          </div>
        </div>

        <span className="landing-hero-board__link" aria-hidden>
          Çalışma alanı önizlemesi
        </span>
      </div>
    </div>
  );
}
