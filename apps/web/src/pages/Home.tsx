import { useLang } from '../i18n.tsx';
import { TOOLS, TOOL_GROUPS } from '../strings.ts';

export function Home() {
  const { lang, s } = useLang();
  const statusLabel = { available: s.statusAvailable, progress: s.statusProgress, planned: s.statusPlanned, later: s.statusLater } as const;

  return (
    <main>
      <section className="hero">
        <div className="container hero-inner">
          <h1>{s.heroTitle}</h1>
          <p className="lead">{s.heroText}</p>
          <div className="row">
            <a className="btn btn-primary btn-large" href="#/livery">
              {s.heroCtaLivery}
            </a>
            <a className="btn btn-large" href="#/prop">
              {s.heroCta}
            </a>
          </div>
          <p className="privacy">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="privacy-icon">
              <path d="M10 1.8 3 4.6v4.9c0 4.2 2.8 7.4 7 8.7 4.2-1.3 7-4.5 7-8.7V4.6l-7-2.8Zm-1 11.4-2.7-2.7 1.2-1.2 1.5 1.5 3.6-3.6 1.2 1.2L9 13.2Z" fill="currentColor" />
            </svg>
            <span>
              <strong>{s.privacyTitle}.</strong> {s.privacyText}
            </span>
          </p>
        </div>
      </section>

      <section className="container section" aria-labelledby="tools-title">
        <h2 id="tools-title">{s.toolsTitle}</h2>
        <p className="muted section-intro">{s.toolsIntro}</p>
        {TOOL_GROUPS.map((group) => {
          const tools = TOOLS.filter((t) => t.group === group);
          if (tools.length === 0) return null;
          return (
            <div key={group} className="tool-group">
              <h3 className="tool-group-title">{s.groupTitles[group]}</h3>
              <ul className="tool-grid">
                {tools.map((tool) => (
                  <li key={tool.id} className={`tool tool-${tool.status}`}>
                    <div className="tool-top">
                      <h4>{tool.name[lang]}</h4>
                      <span className={`badge badge-${tool.status}`}>{statusLabel[tool.status]}</span>
                    </div>
                    <p>{tool.text[lang]}</p>
                    {tool.route ? (
                      <a className="btn btn-small" href={`#${tool.route}`}>
                        {s.openTool}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </main>
  );
}
