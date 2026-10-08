import { PROP_PIPELINE } from '@toolkit/forge-core';
import { useLang } from '../i18n.tsx';

export function PipelineStatus() {
  const { lang, s } = useLang();
  const done = PROP_PIPELINE.filter((p) => p.status === 'done').length;

  return (
    <section className="card" aria-labelledby="pipeline-title">
      <div className="card-head">
        <h3 id="pipeline-title">{s.pipelineTitle}</h3>
        <span className="muted small">
          {done}/{PROP_PIPELINE.length}
        </span>
      </div>
      <ol className="pipeline">
        {PROP_PIPELINE.map((step) => (
          <li key={step.id} className={`step step-${step.status}`}>
            <span className="step-mark" aria-hidden="true">
              {step.status === 'done' ? '✓' : step.status === 'active' ? '●' : '○'}
            </span>
            <span className="step-label">{step.label[lang]}</span>
            <span className="step-state">
              {step.status === 'done' ? s.pipelineDone : step.status === 'active' ? s.pipelineActive : s.pipelineTodo}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
