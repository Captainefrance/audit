import { externals, layers, links, type LinkType } from "../data/architecture";
import { scenarios } from "../data/scenarios";
import type { LinkRef, ScenarioMode } from "../data/scenarios/types";
import { defaultLang, type Lang } from "../i18n";

export interface ResolvedStep {
  nodes: string[];
  links: { from: string; to: string; type?: LinkType }[];
  focus: string;
  tag?: string;
  caption: string;
  /** Langue réelle de la caption (FR si la version de la langue demandée est vide alors que le FR ne l'est pas). */
  captionLang: Lang;
  durationMs: number;
}

export interface ResolvedScenario {
  id: string;
  mode: ScenarioMode;
  title: string;
  description?: string;
  trail: boolean;
  steps: ResolvedStep[];
}

const DEFAULT_DURATION = 4000;

const isDev = import.meta.env.DEV;

/** Validation au build ; échoue avec un message qui nomme le fichier et l'étape. */
function validate() {
  const draftNodes = new Set<string>();
  const nodeIds = new Set<string>();
  for (const layer of layers) {
    for (const tool of layer.tools) {
      nodeIds.add(tool.id);
      if (layer.draft || tool.draft) draftNodes.add(tool.id);
    }
  }
  for (const ext of externals) {
    nodeIds.add(ext.id);
    if (ext.draft) draftNodes.add(ext.id);
  }
  const seen = new Set<string>();

  for (const { file, scenario } of scenarios) {
    const where = `scenarios/${file}.ts`;
    if (scenario.id !== file) throw new Error(`${where} : id "${scenario.id}" doit être égal au nom du fichier "${file}"`);
    if (seen.has(scenario.id)) throw new Error(`${where} : id "${scenario.id}" en double`);
    seen.add(scenario.id);
    if (scenario.steps.length === 0) throw new Error(`${where} : au moins une étape est requise`);
    const published = !scenario.draft;

    scenario.steps.forEach((step, i) => {
      const at = `${where}, étape ${i + 1}`;
      const refs = new Set<string>(step.nodes);
      if (step.nodes.length === 0 && (step.links ?? []).length === 0) {
        throw new Error(`${at} : aucun nœud ni lien à illuminer`);
      }
      const linkEnds = new Set<string>();
      for (const ref of step.links ?? []) {
        const match = links.filter((l) => l.from === ref.from && l.to === ref.to && (!ref.type || l.type === ref.type));
        if (match.length === 0) {
          throw new Error(`${at} : lien ${ref.from} → ${ref.to}${ref.type ? ` (${ref.type})` : ""} absent de links (architecture.ts)`);
        }
        if (published && match.every((l) => l.draft)) {
          throw new Error(`${at} : scénario publié mais lien ${ref.from} → ${ref.to} est en draft`);
        }
        linkEnds.add(ref.from);
        linkEnds.add(ref.to);
        refs.add(ref.from);
        refs.add(ref.to);
      }
      for (const id of step.nodes) {
        if (!nodeIds.has(id)) throw new Error(`${at} : nœud "${id}" inconnu (outil ou nœud externe de architecture.ts)`);
      }
      if (step.focus && !step.nodes.includes(step.focus) && !linkEnds.has(step.focus)) {
        throw new Error(`${at} : focus "${step.focus}" doit faire partie de nodes ou être une extrémité d'un lien de l'étape`);
      }
      if (published) {
        for (const id of refs) {
          if (draftNodes.has(id)) throw new Error(`${at} : scénario publié mais "${id}" est en draft (masqué en production)`);
        }
        if (!step.caption.fr.trim() && !step.caption.en.trim()) {
          // Légitime (étape sans texte) : simple avertissement.
          console.warn(`[scénarios] ${at} : caption vide.`);
        }
      }
    });
  }
}

/** Scénarios visibles dans `lang` (les brouillons n'existent qu'en `astro dev`). */
export function resolveScenarios(lang: Lang): ResolvedScenario[] {
  validate();
  return scenarios
    .filter(({ scenario }) => isDev || !scenario.draft)
    .map(({ scenario: s }) => ({
      id: s.id,
      mode: s.mode,
      title: s.title[lang] || s.title[defaultLang],
      description: (s.description?.[lang] || s.description?.[defaultLang]) || undefined,
      trail: s.trail ?? true,
      steps: s.steps.map((step) => {
        const own = step.caption[lang]?.trim();
        const fallback = !own && step.caption[defaultLang]?.trim();
        const firstLink: LinkRef | undefined = step.links?.[0];
        return {
          nodes: step.nodes,
          links: (step.links ?? []).map((l) => ({ from: l.from, to: l.to, type: l.type })),
          focus: step.focus ?? step.nodes[0] ?? firstLink!.from,
          tag: step.tag,
          caption: own || (fallback ? step.caption[defaultLang].trim() : ""),
          captionLang: fallback ? defaultLang : lang,
          durationMs: step.durationMs ?? DEFAULT_DURATION,
        };
      }),
    }));
}
