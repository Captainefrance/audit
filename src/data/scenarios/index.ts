/**
 * Scénarios : un fichier par scénario dans ce dossier (nom de fichier = `id`).
 * Ajouter un scénario = créer un fichier `src/data/scenarios/<id>.ts` (voir attack-example.ts).
 * Aucun autre fichier à modifier.
 */
import type { Scenario } from "./types";

const modules = import.meta.glob<{ default?: Scenario }>("./*.ts", { eager: true });

export const scenarios: { file: string; scenario: Scenario }[] = Object.entries(modules)
  .filter(([path, mod]) => !/\/(index|types)\.ts$/.test(path) && mod.default)
  .map(([path, mod]) => ({ file: path.replace(/^\.\/|\.ts$/g, ""), scenario: mod.default! }))
  .sort((a, b) => a.file.localeCompare(b.file));
