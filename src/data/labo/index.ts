/**
 * Scénarios du Labo SOC. Ajouter un scénario : créer src/data/labo/<id>.ts (voir aitm-bec.ts)
 * et l'ajouter à cette liste (l'ordre est celui de la page).
 */
import type { ScenarioDef } from "../../lib/labo/types";
import aitmBec from "./aitm-bec";

export const SCENARIOS: ScenarioDef[] = [aitmBec];
