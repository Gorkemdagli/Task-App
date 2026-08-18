import { Kanban, MessageSquareText, ShieldCheck, type LucideIcon } from 'lucide-react';

const capabilities: ReadonlyArray<{
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: 'Sabit akış, görünür sorumluluk',
    description:
      'Yapılacak, Yapılıyor ve Yapıldı sütunları değişmez. Her görevde sorumlu kişi, öncelik ve termin görünür kalır.',
    icon: Kanban,
  },
  {
    title: 'Konuşma görevde kalır',
    description:
      'Görev yorumları ve ilgili bağlam, ekibin yaptığı işin yanında durur; güncelleme ararken konu dağılmaz.',
    icon: MessageSquareText,
  },
  {
    title: 'Yetki sınırı nettir',
    description:
      'Üye kendi görevini ilerletir; Takım Admini kendi takımını, Şirket Admini şirket kapsamını yönetir.',
    icon: ShieldCheck,
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="landing-features landing-viewport-section"
    >
      <div className="landing-section-shell">
        <header className="landing-section-heading">
          <h2 id="features-title">Özellikler</h2>
          <p>İşi görünür kılan üç temel davranış; fazladan görünüm ve süreç yükü olmadan.</p>
        </header>

        <div className="landing-capability-ledger">
          {capabilities.map(({ title, description, icon: Icon }) => (
            <article key={title}>
              <Icon aria-hidden />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
