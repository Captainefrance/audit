// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Pages conservées dans le repo mais hors navigation et hors index.
const hiddenPages = ['/comparatif/', '/souverainete/', '/demo/'];

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
  integrations: [
    sitemap({
      filter: (page) =>
        new URL(page).pathname !== '/' &&
        !hiddenPages.some((p) => page.endsWith(p)),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
