import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { LangProvider } from './i18n.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Wurzelelement #root fehlt.');

createRoot(root).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>,
);
