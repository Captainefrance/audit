import { getCollection } from "astro:content";
import { defaultLang, isLang, locales, type Lang } from "../i18n";

interface Localizable {
  id: string;
  data: { translationKey: string; draft: boolean };
}

export interface Localized<E extends Localizable> {
  entry: E;
  /** Slug d'URL = nom du fichier, sans le dossier de langue. */
  slug: string;
  /** Langue réelle du contenu (≠ langue demandée en cas de fallback). */
  contentLang: Lang;
  fallback: boolean;
}

function parseId(id: string): { lang: Lang; slug: string } {
  const [lang, ...rest] = id.split("/");
  if (!isLang(lang) || rest.length === 0) {
    throw new Error(`Entrée de contenu hors {fr,en}/ : "${id}"`);
  }
  return { lang, slug: rest.join("/") };
}

/** Brouillons visibles uniquement en `astro dev`. */
export function publishable<E extends Localizable>(entries: E[]): E[] {
  return import.meta.env.DEV ? entries : entries.filter((e) => !e.data.draft);
}

/**
 * Entrées visibles dans `lang` : traduction si elle existe, sinon version FR
 * marquée `fallback`. Une entrée existant seulement dans une autre langue que
 * le FR n'apparaît pas dans les autres langues.
 */
export function localize<E extends Localizable>(entries: E[], lang: Lang): Localized<E>[] {
  const byKey = new Map<string, Partial<Record<Lang, E>>>();
  for (const entry of publishable(entries)) {
    const { lang: l } = parseId(entry.id);
    const group = byKey.get(entry.data.translationKey) ?? {};
    if (group[l]) {
      throw new Error(
        `translationKey "${entry.data.translationKey}" en double pour la langue ${l}`,
      );
    }
    group[l] = entry;
    byKey.set(entry.data.translationKey, group);
  }
  const out: Localized<E>[] = [];
  for (const group of byKey.values()) {
    const own = group[lang];
    const entry = own ?? group[defaultLang];
    if (!entry) continue;
    const { lang: contentLang, slug } = parseId(entry.id);
    out.push({ entry, slug, contentLang, fallback: contentLang !== lang });
  }
  return out;
}

/**
 * Pour l'entrée `key` : slug par langue (avec fallback FR, pour le sélecteur de langue)
 * et langues où une vraie traduction existe (pour hreflang).
 */
export function translationInfo<E extends Localizable>(entries: E[], key: string) {
  const slugs = {} as Record<Lang, string>;
  const translated: Lang[] = [];
  for (const lang of locales) {
    const item = localize(entries, lang).find((i) => i.entry.data.translationKey === key);
    if (!item) continue;
    slugs[lang] = item.slug;
    if (!item.fallback) translated.push(lang);
  }
  return { slugs, translated };
}

export async function getNewsEntries() {
  return getCollection("news");
}

export function sortByDateDesc<I extends { entry: { data: { date: Date } } }>(items: I[]): I[] {
  return [...items].sort(
    (a, b) => b.entry.data.date.getTime() - a.entry.data.date.getTime(),
  );
}
