import type { Lang } from "./index";

/**
 * Langues où le contenu des pages statiques existe réellement.
 * Une langue absente = version FR affichée avec bandeau (et exclue du sitemap).
 * Traduire une page : ajouter "en" ici et fournir le contenu EN dans la page.
 */
export const pageTranslations = {
  home: ["fr"],
  about: ["fr"],
  news: ["fr", "en"],
} as const satisfies Record<string, readonly Lang[]>;
