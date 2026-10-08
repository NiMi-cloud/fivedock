import { Suspense, lazy, useEffect, useState } from 'react';
import { useLang } from './i18n.tsx';
import { Home } from './pages/Home.tsx';
import { Datenschutz, Impressum } from './pages/Legal.tsx';

// Der Prop Creator bringt three.js mit und wird erst geladen, wenn man ihn öffnet.
const PropCreator = lazy(() => import('./pages/PropCreator.tsx').then((m) => ({ default: m.PropCreator })));
const TextureLab = lazy(() => import('./pages/TextureLab.tsx').then((m) => ({ default: m.TextureLab })));
const Livery = lazy(() => import('./pages/Livery.tsx').then((m) => ({ default: m.Livery })));
const Importer = lazy(() => import('./pages/Importer.tsx').then((m) => ({ default: m.Importer })));

function currentRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

function useRoute(): string {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => {
      setRoute(currentRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

type Theme = 'dark' | 'light';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'dark' || stored === 'light') return stored;
    } catch {
      /* Speicher nicht verfügbar */
    }
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* ignorieren */
    }
  }, [theme]);

  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

export function App() {
  const { s, toggle } = useLang();
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <a className="brand" href="#/">
            <span className="brand-mark" aria-hidden="true">F</span>
            {s.brand}
          </a>
          <nav className="nav" aria-label="Navigation">
            <a href="#/" aria-current={route === '/' ? 'page' : undefined}>{s.navTools}</a>
            <a href="#/livery" aria-current={route === '/livery' ? 'page' : undefined}>{s.navLivery}</a>
            <a href="#/prop" aria-current={route === '/prop' ? 'page' : undefined}>{s.navPropCreator}</a>
            <a href="#/editor" aria-current={route === '/editor' ? 'page' : undefined}>{s.edtPageTitle}</a>
            <a href="#/importer" aria-current={route === '/importer' ? 'page' : undefined}>{s.navImporter}</a>
            <a href="#/textures" aria-current={route === '/textures' ? 'page' : undefined}>{s.navTextures}</a>
          </nav>
          <div className="topbar-actions">
            <button type="button" className="btn btn-small" onClick={toggle}>
              {s.langToggle}
            </button>
            <button type="button" className="btn btn-small" onClick={toggleTheme} aria-label={s.themeToggle} title={s.themeToggle}>
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>
      </header>

      {route === '/prop' ? (
        <Suspense fallback={<p className="container notice" role="status">{s.loading}</p>}>
          <PropCreator />
        </Suspense>
      ) : route === '/livery' ? (
        <Suspense fallback={<p className="container notice" role="status">{s.loading}</p>}>
          <Livery />
        </Suspense>
      ) : route === '/editor' ? (
        <Suspense fallback={<p className="container notice" role="status">{s.loading}</p>}>
          <Livery mode="editor" />
        </Suspense>
      ) : route === '/importer' ? (
        <Suspense fallback={<p className="container notice" role="status">{s.loading}</p>}>
          <Importer />
        </Suspense>
      ) : route === '/textures' ? (
        <Suspense fallback={<p className="container notice" role="status">{s.loading}</p>}>
          <TextureLab />
        </Suspense>
      ) : route === '/impressum' ? (
        <Impressum />
      ) : route === '/datenschutz' ? (
        <Datenschutz />
      ) : (
        <Home />
      )}

      <footer className="footer">
        <div className="container">
          <p>{s.footerNote}</p>
          <p className="small footer-links">
            <a href="#/impressum">{s.footerImprint}</a>
            <a href="#/datenschutz">{s.footerPrivacy}</a>
          </p>
        </div>
      </footer>
    </>
  );
}
