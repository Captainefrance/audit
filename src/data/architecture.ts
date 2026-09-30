/**
 * Données de l'architecture du SI. Le schéma, l'index et le scrollytelling se génèrent depuis ce fichier.
 *
 * - Ajouter une couche : un objet dans `layers` (l'ordre = l'ordre d'empilement, du haut vers le bas).
 * - Ajouter un outil : un objet dans `tools` de sa couche.
 *   Si `hasPage: true`, créer aussi `src/content/tools/{fr,en}/<id>.md` (nom de fichier = `id`).
 * - Ajouter un lien entre deux outils : un objet dans `links` (`from` → `to`, avec un `type`).
 * - `dependsOn` : ids des outils dont dépend un outil (panne en cascade, scénarios).
 *   Distinct des liens : un lien décrit ce qui circule, `dependsOn` ce qui doit fonctionner.
 * - Nœud externe (`externals`) : attaquant, Internet, utilisateur… Dessiné hors des couches (au-dessus ou
 *   en dessous), utilisable dans `links`, les scénarios (`nodes`, `links`, `focus`). Pas de fiche outil, pas de
 *   `dependsOn`. Il ne « tombe » en mode panne que s'il est déclaré `canFail: true` ; un outil ne peut
 *   dépendre (`dependsOn`) d'un nœud externe que dans ce cas.
 * - Sémantique de `dependsOn` : `dependsOn: ["B"]` sur A signifie « A tombe si B tombe ».
 * - Texte d'une couche affiché au défilement : `src/content/layers/{fr,en}/<id de la couche>.md`
 *   (corps vide ou fichier absent = pas de panneau).
 * - `draft: true` : visible uniquement en `astro dev`, absent du build de production.
 * Voir docs/CONTENT.md.
 */
import type { Lang } from "../i18n";

/** Types de liens. Ajouter un type : l'ajouter ici, dans `linkTypeLabels` et dans `linkTypeOrder`. */
export type LinkType =
  | "flux"
  | "authentification"
  | "sauvegarde"
  | "supervision"
  | "administration";

/** Libellés bilingues, utilisés par la légende (générée depuis les types réellement utilisés). */
export const linkTypeLabels: Record<LinkType, Record<Lang, string>> = {
  flux: { fr: "Flux", en: "Data flow" },
  authentification: { fr: "Authentification", en: "Authentication" },
  sauvegarde: { fr: "Sauvegarde", en: "Backup" },
  supervision: { fr: "Supervision", en: "Monitoring" },
  administration: { fr: "Administration", en: "Administration" },
};

/** Ordre d'affichage dans la légende. */
export const linkTypeOrder: readonly LinkType[] = [
  "flux",
  "authentification",
  "sauvegarde",
  "supervision",
  "administration",
];

export interface ToolNode {
  /** Identifiant stable = nom du fichier .md de la fiche et segment d'URL. */
  id: string;
  category: string;
  name: string;
  hasPage: boolean;
  /** Ids des outils dont celui-ci dépend. */
  dependsOn?: string[];
  draft?: boolean;
}

export interface Layer {
  id: string;
  name: Record<Lang, string>;
  tools: ToolNode[];
  draft?: boolean;
}

/** Types de nœuds externes (style et libellé d'accessibilité). */
export type ExternalKind = "attacker" | "internet" | "user" | "other";

export interface ExternalNode {
  /** Identifiant unique, partagé avec les ids d'outils (pas de doublon entre les deux). */
  id: string;
  kind: ExternalKind;
  name: Record<Lang, string>;
  /** Dessiné au-dessus des couches (défaut) ou en dessous. */
  placement?: "top" | "bottom";
  /** Peut tomber en mode panne, et être une dépendance d'un outil. Défaut : false. */
  canFail?: boolean;
  draft?: boolean;
}

export interface Link {
  from: string;
  to: string;
  type: LinkType;
  draft?: boolean;
}

export const layers: Layer[] = [
  {
    id: "layer-example",
    name: { fr: "Couche exemple", en: "Example layer" },
    draft: true,
    tools: [
      { id: "tool-example-1", category: "Catégorie exemple", name: "Outil exemple 1", hasPage: true, draft: true },
      { id: "tool-example-2", category: "Catégorie exemple", name: "Outil exemple 2", hasPage: true, draft: true },
      { id: "tool-example-3", category: "Catégorie exemple", name: "Outil exemple 3", hasPage: false, draft: true },
    ],
  },
  {
    id: "layer-example-2",
    name: { fr: "Couche exemple 2", en: "Example layer 2" },
    draft: true,
    tools: [
      { id: "tool-example-4", category: "Catégorie exemple", name: "Outil exemple 4", hasPage: false, dependsOn: ["tool-example-1"], draft: true },
      { id: "tool-example-5", category: "Catégorie exemple", name: "Outil exemple 5", hasPage: false, dependsOn: ["tool-example-2", "ext-offsite"], draft: true },
    ],
  },
  {
    id: "layer-example-3",
    name: { fr: "Couche exemple 3", en: "Example layer 3" },
    draft: true,
    tools: [
      { id: "tool-example-6", category: "Catégorie exemple", name: "Outil exemple 6", hasPage: false, dependsOn: ["tool-example-4", "tool-example-5"], draft: true },
    ],
  },
];

export const externals: ExternalNode[] = [
  { id: "ext-attacker", kind: "attacker", name: { fr: "Attaquant (exemple)", en: "Attacker (example)" }, placement: "top", draft: true },
  { id: "ext-internet", kind: "internet", name: { fr: "Internet (exemple)", en: "Internet (example)" }, placement: "top", draft: true },
  { id: "ext-user", kind: "user", name: { fr: "Utilisateur (exemple)", en: "User (example)" }, placement: "top", draft: true },
  { id: "ext-offsite", kind: "other", name: { fr: "Site distant (exemple)", en: "Remote site (example)" }, placement: "bottom", canFail: true, draft: true },
];

export const links: Link[] = [
  { from: "ext-attacker", to: "ext-internet", type: "flux", draft: true },
  { from: "ext-internet", to: "tool-example-1", type: "flux", draft: true },
  { from: "ext-user", to: "tool-example-1", type: "authentification", draft: true },
  { from: "tool-example-6", to: "ext-offsite", type: "sauvegarde", draft: true },
  { from: "tool-example-1", to: "tool-example-4", type: "flux", draft: true },
  { from: "tool-example-2", to: "tool-example-5", type: "authentification", draft: true },
  { from: "tool-example-3", to: "tool-example-6", type: "supervision", draft: true },
  { from: "tool-example-4", to: "tool-example-6", type: "flux", draft: true },
  { from: "tool-example-5", to: "tool-example-6", type: "sauvegarde", draft: true },
  { from: "tool-example-1", to: "tool-example-2", type: "administration", draft: true },
];
