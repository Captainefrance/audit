import { getCollection } from "astro:content";
import {
  layers,
  links,
  linkTypeLabels,
  linkTypeOrder,
  type Layer,
  type LinkType,
  type ToolNode,
} from "../data/architecture";
import { defaultLang, locales, type Lang } from "../i18n";
import { localize } from "./collections";

export interface ResolvedTool {
  id: string;
  category: string;
  name: string;
  layerId: string;
  /** Chemin sans locale de la fiche ("/architecture/<id>/"), absent si pas de fiche publiée. */
  href?: string;
  /** Ids (visibles) dont dépend l'outil. */
  dependsOn: string[];
  draft: boolean;
}

export interface ResolvedLayer {
  id: string;
  name: string;
  tools: ResolvedTool[];
  draft: boolean;
}

export interface ResolvedLink {
  from: string;
  to: string;
  type: LinkType;
}

export interface ResolvedGraph {
  layers: ResolvedLayer[];
  links: ResolvedLink[];
  /** Types de liens réellement utilisés (visibles), avec libellé dans la langue demandée. */
  linkTypes: { type: LinkType; label: string }[];
}

const visible = <T extends { draft?: boolean }>(items: T[]) =>
  import.meta.env.DEV ? items : items.filter((i) => !i.draft);

type ToolEntries = Awaited<ReturnType<typeof getCollection<"tools">>>;
type LayerEntries = Awaited<ReturnType<typeof getCollection<"layers">>>;

const slugOf = (id: string) => id.split("/").slice(1).join("/");

function validate(toolEntries: ToolEntries, layerEntries: LayerEntries) {
  const layerIds = new Set<string>();
  const toolLayer = new Map<string, string>();
  const deps = new Map<string, string[]>();
  for (const layer of layers) {
    if (layerIds.has(layer.id)) throw new Error(`architecture.ts : couche "${layer.id}" en double`);
    layerIds.add(layer.id);
    for (const tool of layer.tools) {
      if (toolLayer.has(tool.id)) throw new Error(`architecture.ts : outil "${tool.id}" en double`);
      toolLayer.set(tool.id, layer.id);
      deps.set(tool.id, tool.dependsOn ?? []);
    }
  }
  for (const [id, list] of deps) {
    for (const dep of list) {
      if (dep === id) throw new Error(`architecture.ts : "${id}" dépend de lui-même`);
      if (!toolLayer.has(dep)) throw new Error(`architecture.ts : "${id}".dependsOn → "${dep}" inconnu`);
    }
  }
  // Cycles de dépendance : interdits (la panne en cascade ne terminerait pas de façon lisible).
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      throw new Error(`architecture.ts : cycle dans dependsOn : ${[...path, id].join(" → ")}`);
    }
    state.set(id, 1);
    for (const dep of deps.get(id) ?? []) visit(dep, [...path, id]);
    state.set(id, 2);
  };
  for (const id of deps.keys()) visit(id, []);

  for (const link of links) {
    for (const end of [link.from, link.to]) {
      if (!toolLayer.has(end)) throw new Error(`architecture.ts : lien ${link.from} → ${link.to} : outil "${end}" inconnu`);
    }
    if (!(link.type in linkTypeLabels)) {
      throw new Error(`architecture.ts : lien ${link.from} → ${link.to} : type "${link.type}" inconnu`);
    }
  }

  for (const entry of toolEntries) {
    const slug = slugOf(entry.id);
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
  for (const entry of layerEntries) {
    const slug = slugOf(entry.id);
    if (!layerIds.has(slug)) {
      throw new Error(`Texte de couche "${entry.id}" : aucune couche "${slug}" dans src/data/architecture.ts`);
    }
    if (entry.data.translationKey !== slug) {
      throw new Error(`Texte de couche "${entry.id}" : translationKey doit valoir "${slug}"`);
    }
  }
}

/** Graphe (couches, outils, liens) visible dans `lang`. */
export async function resolveGraph(lang: Lang): Promise<ResolvedGraph> {
  const toolEntries = await getCollection("tools");
  validate(toolEntries, await getCollection("layers"));
  const pages = new Set(localize(toolEntries, lang).map((i) => i.slug));

  const visibleLayers = visible(layers);
  const visibleIds = new Set<string>();
  for (const layer of visibleLayers) for (const tool of visible(layer.tools)) visibleIds.add(tool.id);

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
      dependsOn: (tool.dependsOn ?? []).filter((d) => visibleIds.has(d)),
      draft: Boolean(tool.draft),
    };
  };

  const resolvedLayers: ResolvedLayer[] = visibleLayers.map((layer) => ({
    id: layer.id,
    name: layer.name[lang],
    draft: Boolean(layer.draft),
    tools: visible(layer.tools).map(resolveTool(layer)),
  }));

  const resolvedLinks = visible(links)
    .filter((l) => visibleIds.has(l.from) && visibleIds.has(l.to))
    .map(({ from, to, type }) => ({ from, to, type }));
  const used = new Set(resolvedLinks.map((l) => l.type));

  return {
    layers: resolvedLayers,
    links: resolvedLinks,
    linkTypes: linkTypeOrder
      .filter((type) => used.has(type))
      .map((type) => ({ type, label: linkTypeLabels[type][lang] })),
  };
}

/** Couches et outils visibles dans `lang`, avec lien de fiche quand une fiche publiée existe. */
export async function resolveArchitecture(lang: Lang): Promise<ResolvedLayer[]> {
  return (await resolveGraph(lang)).layers;
}

export interface LayerPanel {
  entry: LayerEntries[number];
  /** Langue réelle du texte (FR si pas de traduction). */
  contentLang: Lang;
}

/** Textes de couche publiés dans `lang` (clé = id de couche). Corps vide = pas de panneau. */
export async function getLayerPanels(lang: Lang): Promise<Map<string, LayerPanel>> {
  const entries = await getCollection("layers");
  const panels = new Map<string, LayerPanel>();
  for (const item of localize(entries, lang)) {
    if (!item.entry.body?.trim()) continue;
    panels.set(item.slug, { entry: item.entry, contentLang: item.contentLang });
  }
  return panels;
}

/** Langues où la page /architecture a un vrai contenu (sinon : page « à venir » en FR seulement). */
export async function architectureTranslations(): Promise<readonly Lang[]> {
  const layers = await resolveArchitecture(defaultLang);
  return layers.some((l) => l.tools.length > 0) ? locales : [defaultLang];
}
