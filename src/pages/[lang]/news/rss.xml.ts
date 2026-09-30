import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getLangStaticPaths, localePath, t, type Lang } from "../../../i18n";
import { getNewsEntries, localize, sortByDateDesc } from "../../../lib/collections";

export const getStaticPaths = getLangStaticPaths;

export async function GET(context: APIContext) {
  const lang = context.params.lang as Lang;
  const items = sortByDateDesc(localize(await getNewsEntries(), lang));
  return rss({
    title: `${t(lang, "news.title")} · audit-hq.dev`,
    description: `${t(lang, "news.title")} · audit-hq.dev`,
    site: context.site!,
    customData: `<language>${lang}</language>`,
    items: items.map(({ entry, slug }) => ({
      title: entry.data.title,
      pubDate: entry.data.date,
      link: localePath(lang, `/news/${slug}`),
      categories: entry.data.tags,
      description: entry.data.source.name,
    })),
  });
}
