// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://audit-hq.dev',
  i18n: {
    locales: ['fr', 'en'],
    defaultLocale: 'fr',
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  redirects: {
    '/a-propos': '/fr/a-propos/',
    '/architecture': '/fr/architecture/',
  },
  vite: {
    plugins: [tailwindcss()],
    // Pas de script inline (CSP sans 'unsafe-inline' pour les scripts) : toujours un fichier externe.
    build: { assetsInlineLimit: 0 },
  },
});
