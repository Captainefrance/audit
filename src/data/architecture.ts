/**
 * Données de l'architecture du SI. Le schéma et l'index se génèrent depuis ce fichier.
 *
 * - Ajouter une couche : un objet dans `layers` (l'ordre = l'ordre d'empilement, du haut vers le bas).
 * - Ajouter un outil : un objet dans `tools` de sa couche.
 *   Si `hasPage: true`, créer aussi `src/content/tools/{fr,en}/<id>.md` (nom de fichier = `id`).
 * - `draft: true` : visible uniquement en `astro dev`, absent du build de production.
 * Voir docs/CONTENT.md.
 */
import type { Lang } from "../i18n";

export interface ToolNode {
  /** Identifiant stable = nom du fichier .md de la fiche et segment d'URL. */
  id: string;
  category: string;
  name: string;
  hasPage: boolean;
  draft?: boolean;
}

export interface Layer {
  id: string;
  name: Record<Lang, string>;
  tools: ToolNode[];
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
];
