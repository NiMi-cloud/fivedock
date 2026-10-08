import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { STRINGS } from './strings.ts';
import type { Lang, Strings } from './strings.ts';

interface LangState {
  lang: Lang;
  s: Strings;
  toggle: () => void;
}

const LangContext = createContext<LangState | null>(null);

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem('lang');
    if (stored === 'de' || stored === 'en') return stored;
  } catch {
    /* Speicher nicht verfügbar: Standard nutzen */
  }
  return navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('lang', lang);
    } catch {
      /* ignorieren */
    }
  }, [lang]);

  const toggle = useCallback(() => setLang((l) => (l === 'de' ? 'en' : 'de')), []);
  const value = useMemo(() => ({ lang, s: STRINGS[lang], toggle }), [lang, toggle]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangState {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang außerhalb des LangProvider verwendet.');
  return ctx;
}
