import { fr, type Dict } from "./fr";
import { en } from "./en";

export const locales = ["fr", "en"] as const;
export type Lang = (typeof locales)[number];
export const defaultLang: Lang = "fr";

const dictionaries: Record<Lang, Dict> = { fr, en };

export function isLang(value: unknown): value is Lang {
  return locales.includes(value as Lang);
}

/** Texte d'interface typé. */
export function t(lang: Lang, key: keyof Dict): string {
  return dictionaries[lang][key];
}

/** Chemin localisé, toujours avec slash final : localePath("en", "/news") → "/en/news/". */
export function localePath(lang: Lang, path = "/"): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean ? `/${lang}/${clean}/` : `/${lang}/`;
}

/** Sépare "/en/news/x/" en { lang: "en", rest: "/news/x/" }. lang = null hors locale. */
export function splitLocale(pathname: string): { lang: Lang | null; rest: string } {
  const [, first, ...others] = pathname.split("/");
  if (isLang(first)) {
    const rest = others.join("/");
    return { lang: first, rest: rest ? `/${rest}` : "/" };
  }
  return { lang: null, rest: pathname };
}

export function getLangStaticPaths() {
  return locales.map((lang) => ({ params: { lang } }));
}

/** Substitue {clé} dans un texte d'interface. */
export function format(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));
}

const dateLocales: Record<Lang, string> = { fr: "fr-CA", en: "en-CA" };

export function formatDate(lang: Lang, date: Date): string {
  return new Intl.DateTimeFormat(dateLocales[lang], {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}
