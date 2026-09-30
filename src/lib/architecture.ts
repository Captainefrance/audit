import { getCollection } from "astro:content";
import { layers, type Layer, type ToolNode } from "../data/architecture";
import { defaultLang, locales, type Lang } from "../i18n";
import { localize } from "./collections";

export interface ResolvedTool {
  id: string;
  category: string;
  name: string;
  layerId: string;
  /** Chemin sans locale de la fiche ("/architecture/<id>/"), absent si pas de fiche publiée. */
  href?: string;
  draft: boolean;
}

export interface ResolvedLayer {
  id: string;
  name: string;
  tools: ResolvedTool[];
  draft: boolean;
}

const visible = <T extends { draft?: boolean }>(items: T[]) =>
  import.meta.env.DEV ? items : items.filter((i) => !i.draft);

function validate(toolEntries: Awaited<ReturnType<typeof getCollection<"tools">>>) {
  const layerIds = new Set<string>();
  const toolLayer = new Map<string, string>();
  for (const layer of layers) {
    if (layerIds.has(layer.id)) throw new Error(`architecture.ts : couche "${layer.id}" en double`);
    layerIds.add(layer.id);
    for (const tool of layer.tools) {
      if (toolLayer.has(tool.id)) throw new Error(`architecture.ts : outil "${tool.id}" en double`);
      toolLayer.set(tool.id, layer.id);
    }
  }
  for (const entry of toolEntries) {
    const slug = entry.id.split("/").slice(1).join("/");
    const layer = toolLayer.get(slug);
    if (!layer) {
      throw new Error(`Fiche "${entry.id}" : aucun outil "${slug}" dans src/data/architecture.ts`);
    }
    if (entry.data.layer !== layer) {
      throw new Error(
        `Fiche "${entry.id}" : layer "${entry.data.layer}" ≠ "${layer}" (architecture.ts)`,
      );
    }
  }
}

/** Couches et outils visibles dans `lang`, avec lien de fiche quand une fiche publiée existe. */
export async function resolveArchitecture(lang: Lang): Promise<ResolvedLayer[]> {
  const toolEntries = await getCollection("tools");
  validate(toolEntries);
  const pages = new Set(localize(toolEntries, lang).map((i) => i.slug));

  const resolveTool = (layer: Layer) => (tool: ToolNode): ResolvedTool => {
    if (tool.hasPage && !pages.has(tool.id) && !tool.draft) {
      console.warn(`[architecture] "${tool.id}" a hasPage: true mais aucune fiche publiée (${lang}).`);
    }
    return {
      id: tool.id,
      category: tool.category,
      name: tool.name,
      layerId: layer.id,
      href: tool.hasPage && pages.has(tool.id) ? `/architecture/${tool.id}/` : undefined,
      draft: Boolean(tool.draft),
    };
  };

  return visible(layers).map((layer) => ({
    id: layer.id,
    name: layer.name[lang],
    draft: Boolean(layer.draft),
    tools: visible(layer.tools).map(resolveTool(layer)),
  }));
}

/** Langues où la page /architecture a un vrai contenu (sinon : page « à venir » en FR seulement). */
export async function architectureTranslations(): Promise<readonly Lang[]> {
  const layers = await resolveArchitecture(defaultLang);
  return layers.some((l) => l.tools.length > 0) ? locales : [defaultLang];
}
