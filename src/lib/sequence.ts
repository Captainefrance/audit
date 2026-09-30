/**
 * Logique pure du moteur de séquence (sans DOM) : états par étape, cascade de panne.
 * Utilisée par src/scripts/sequence-engine.ts.
 */

export type LinkKey = string;

export interface SimLinkRef {
  from: string;
  to: string;
  type?: string;
}

export interface SimStep {
  nodes: string[];
  links: SimLinkRef[];
  focus: string;
  tag?: string;
  caption: string;
  captionLang: string;
  durationMs: number;
}

export interface SimScenario {
  id: string;
  mode: "attack" | "flow";
  title: string;
  description?: string;
  trail: boolean;
  steps: SimStep[];
}

export type NodeVisual = "active" | "visited" | "dim";

export const linkKey = (from: string, to: string, type?: string): LinkKey => `${from}>${to}>${type ?? ""}`;

/** Un lien du schéma (from, to, type) correspond-il à une référence de scénario (type facultatif) ? */
export function linkMatches(ref: SimLinkRef, from: string, to: string, type: string): boolean {
  return ref.from === from && ref.to === to && (!ref.type || ref.type === type);
}

/**
 * États des nœuds et des liens à l'étape `index` : actif = étape courante ; visité = étapes
 * précédentes (si `trail`) ; dim = tout le reste. Les liens sont décrits par leurs références.
 */
export function computeStepStates(
  scenario: SimScenario,
  index: number,
  allNodes: string[],
): { nodes: Map<string, NodeVisual>; activeLinks: SimLinkRef[]; visitedLinks: SimLinkRef[] } {
  const current = scenario.steps[index];
  const nodes = new Map<string, NodeVisual>();
  for (const id of allNodes) nodes.set(id, "dim");
  const visitedLinks: SimLinkRef[] = [];
  if (scenario.trail) {
    for (let i = 0; i < index; i++) {
      for (const id of scenario.steps[i].nodes) nodes.set(id, "visited");
      visitedLinks.push(...scenario.steps[i].links);
    }
  }
  for (const id of current.nodes) nodes.set(id, "active");
  return { nodes, activeLinks: current.links, visitedLinks };
}

/**
 * Cascade de panne : `dependsOn: ["B"]` sur A signifie « A tombe si B tombe ».
 * Retourne tous les éléments hors service (pannes manuelles + dépendants transitifs) et,
 * pour chacun, s'il ne tombe que par dépendance.
 */
export function computeOutage(
  deps: Record<string, string[]>,
  manualDown: ReadonlySet<string>,
): { down: Set<string>; cascaded: Set<string> } {
  const down = new Set<string>(manualDown);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, list] of Object.entries(deps)) {
      if (!down.has(id) && list.some((d) => down.has(d))) {
        down.add(id);
        changed = true;
      }
    }
  }
  const cascaded = new Set([...down].filter((id) => !manualDown.has(id)));
  return { down, cascaded };
}
