import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { defaultLang, localePath, locales, type Lang } from "../i18n";
import { pageTranslations } from "../i18n/pages";
import { architectureTranslations, resolveArchitecture } from "../lib/architecture";
import { translationInfo } from "../lib/collections";

/** Une page = son chemin (sans locale) dans chaque langue où le contenu existe réellement. */
type Page = Partial<Record<Lang, string>>;

const same = (path: string, langs: readonly Lang[]): Page =>
  Object.fromEntries(langs.map((l) => [l, path]));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function GET(context: APIContext) {
  const site = context.site!;
  const abs = (lang: Lang, path: string) => new URL(localePath(lang, path), site).href;

  const pages: Page[] = [
    same("/", pageTranslations.home),
    same("/a-propos/", pageTranslations.about),
    same("/news/", pageTranslations.news),
    same("/architecture/", await architectureTranslations()),
  ];

  const seen = new Set<string>();
  const collect = (entries: { data: { translationKey: string } }[], base: string) => {
    for (const { data } of entries) {
      if (seen.has(base + data.translationKey)) continue;
      seen.add(base + data.translationKey);
      const { slugs, translated } = translationInfo(entries as never, data.translationKey);
      pages.push(Object.fromEntries(translated.map((l) => [l, `${base}${slugs[l]}/`])));
    }
  };
  collect(await getCollection("news"), "/news/");

  // Fiches outils : seulement celles réellement liées dans le schéma (non masquées).
  const linked = new Set(
    (await resolveArchitecture(defaultLang)).flatMap((l) => l.tools.filter((t) => t.href).map((t) => t.id)),
  );
  const toolEntries = (await getCollection("tools")).filter((e) => linked.has(e.id.split("/").slice(1).join("/")));
  collect(toolEntries, "/architecture/");

  const urls = pages
    .filter((p) => Object.keys(p).length > 0)
    .flatMap((page) => {
      const langs = locales.filter((l) => page[l] !== undefined);
      const alternates = [
        ...langs.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(abs(l, page[l]!))}"/>`),
        ...(page[defaultLang] !== undefined
          ? [`<xhtml:link rel="alternate" hreflang="x-default" href="${esc(abs(defaultLang, page[defaultLang]))}"/>`]
          : []),
      ].join("");
      return langs.map((l) => `<url><loc>${esc(abs(l, page[l]!))}</loc>${alternates}</url>`);
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
