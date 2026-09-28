import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { StoreProvider } from './lib/store';
import { consumeRedirect } from './lib/drive';

// Powrót z logowania Google: token w fragmencie URL — odbieramy go przed startem aplikacji.
(window as unknown as { __driveRedirect: ReturnType<typeof consumeRedirect> }).__driveRedirect = consumeRedirect();

// Aplikacja instalowalna (PWA): działa na pełnym ekranie iPada i ładuje się bez sieci.
if ('serviceWorker' in navigator && import.meta.env.PROD && window.top === window.self) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
