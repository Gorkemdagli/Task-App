const workflowSteps = [
  {
    title: 'Görevi aç',
    description: 'Takım veya Şirket Admini görevi oluşturur ve sorumlusunu belirler.',
  },
  {
    title: 'Önceliği netleştir',
    description: 'Yetkili admin önceliği ve termini belirler.',
  },
  {
    title: 'Durumu ilerlet',
    description: 'Sorumlu, kendi görevini üç sabit durum arasında ilerletir.',
  },
  {
    title: 'Tamamla, arşivle',
    description: 'Tamamlanan ve termini geçen görev silinmez; otomatik arşivlenir.',
  },
] as const;

export function WorkflowSection() {
  return (
    <section
      id="workflow"
      aria-labelledby="workflow-title"
      className="landing-workflow landing-viewport-section"
    >
      <div className="landing-section-shell">
        <header className="landing-section-heading">
          <h2 id="workflow-title">İş akışı</h2>
          <p>Yetki sınırından arşive kadar aynı net sıra.</p>
        </header>

        <ol className="landing-workflow-sequence">
          {workflowSteps.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden>{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
