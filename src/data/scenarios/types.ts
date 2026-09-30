import type { LinkType } from "../architecture";
import type { Lang } from "../../i18n";

export type LocalizedText = Record<Lang, string>;

/** Un scénario « attaque » (mode offensif) ou « flux » (mode pédagogique). Le mode « panne » n'a pas de fichier. */
export type ScenarioMode = "attack" | "flow";

/** Référence à un lien déclaré dans `links` (src/data/architecture.ts). */
export interface LinkRef {
  from: string;
  to: string;
  /** Seulement si plusieurs liens de types différents existent entre les mêmes nœuds. */
  type?: LinkType;
}

export interface ScenarioStep {
  /** Ids d'outils ou de nœuds externes illuminés à cette étape. */
  nodes: string[];
  links?: LinkRef[];
  /** Nœud auquel la caption est rattachée (mobile : sous cet élément). Défaut : nodes[0], sinon le `from` du 1er lien. */
  focus?: string;
  /** Petite étiquette affichée sur l'étape (sans lien), ex. un identifiant de technique. */
  tag?: string;
  /** Texte de l'étape, rédigé par le propriétaire. "" = pas de caption. */
  caption: LocalizedText;
  /** Durée en lecture automatique, en millisecondes. Défaut : 4000. */
  durationMs?: number;
}

export interface Scenario {
  /** Doit être égal au nom du fichier (sans .ts). */
  id: string;
  mode: ScenarioMode;
  title: LocalizedText;
  description?: LocalizedText;
  /** Les étapes passées restent allumées en plus clair. Défaut : true. */
  trail?: boolean;
  steps: ScenarioStep[];
  /** Visible uniquement en `astro dev`. */
  draft?: boolean;
}

/** Aide de typage, sans logique. */
export const defineScenario = (scenario: Scenario): Scenario => scenario;
