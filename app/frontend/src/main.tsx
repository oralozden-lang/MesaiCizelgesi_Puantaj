import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadRuntimeConfig } from './lib/config.ts';
import { eskiOnbellegiTemizle } from './lib/baglanti.ts';

// Load runtime configuration before rendering the app
async function initializeApp() {
  // Prerendered blog pages are served as pure static HTML for SEO.
  // Intentionally skip React mounting so the crawler-facing markup stays
  // lightweight and self-contained — no client-side hydration needed.
  if (
    document
      .querySelector('meta[name="prerender-static-page"]')
      ?.getAttribute('content') === 'blog'
  ) {
    return;
  }

  // Backend projesi değiştiyse eski service worker ve önbelleği bırakma.
  await eskiOnbellegiTemizle();

  try {
    await loadRuntimeConfig();
  } catch (error) {
    console.warn('Runtime configuration could not be loaded:', error);
  }

  createRoot(document.getElementById('root')!).render(<App />);
}

initializeApp();
