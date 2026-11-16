/**
 * Types du Labo SOC : un moteur générique (src/scripts/labo/engine.ts) et des scénarios
 * en fichiers de données (src/data/labo/*.ts). Un scénario décrit son contenu (messages,
 * entités, événements datés) et ses règles (menaces, jugement des actions, issue).
 */

export type Lang = "fr" | "en";
export type Localized = Record<Lang, string>;
export type Level = "discovery" | "analyst" | "expert";
export type EntityType = "user" | "host" | "ip" | "domain";
export type ActionId = "reset" | "revoke" | "mfa" | "rule" | "disable" | "isolate" | "block" | "purge";
export type Verdict = "utile" | "inutile" | "impact";
export type SourceId = "mail" | "proxy" | "identity" | "edr" | "report" | "cloud";
export type StageId = "delivery" | "click" | "compromise" | "persistence" | "collection" | "impact";
export type Severity = "haute" | "moyenne" | "";

export interface SimEvent {
  src: SourceId;
  host?: string;
  user?: string;
  ev: string;
  detail: string;
  ip?: string;
  domain?: string;
  sev?: Severity;
  stage?: StageId;
  /** Titre d'alerte : l'événement crée aussi une alerte dans le SIEM. */
  alert?: string;
  alertEntity?: { type: EntityType; value: string };
}

export interface Ioc {
  type: EntityType;
  value: string;
}

export type MailPart =
  | string
  | { link: string; url: string; cta?: boolean; phish?: boolean }
  | { qr: string };

export interface Mail {
  id: string;
  /** Secondes depuis le début du scénario. */
  at: number;
  from: string;
  addr: string;
  subject: string;
  color: string;
  internal: boolean;
  /** Destinataire affiché (défaut : la boîte du joueur). */
  to?: string;
  /** Vérité terrain : "lure" (hameçonnage) ou "bec" (fraude depuis un compte interne). */
  phish: false | "lure" | "bec";
  headers: { spf: string; dkim: string; dmarc: string; relay: string; returnPath?: string; note?: string };
  body: MailPart[];
  attachment?: { name: string; type: "pdf" | "docx"; size: string; preview: string };
  ioc?: Ioc[];
}

export interface Step {
  at: number;
  when?: (g: Game) => boolean;
  run: (g: Game) => void;
}

export interface Threat {
  id: string;
  name: string;
  active: (g: Game) => boolean;
  contained: (g: Game) => boolean;
  /** Après cette heure, la menace s'est aggravée (contenue « trop tard »). */
  deadline: number;
}

/** API que le moteur donne au scénario. */
export interface Game {
  readonly t: number;
  readonly level: Level;
  readonly lang: Lang;
  readonly rng: () => number;
  flags: Record<string, unknown>;
  applied: (action: ActionId, value: string) => boolean;
  /** Heure (secondes) de la dernière application de l'action sur cette valeur, sinon undefined. */
  appliedAt: (action: ActionId, value: string) => number | undefined;
  event: (e: SimEvent) => void;
  mail: (m: Omit<Mail, "at">) => void;
  attack: (text: string) => void;
  reported: (mailId: string) => boolean;
}

export interface ScenarioInstance {
  briefing: { context: string; objectives: string[] };
  /** Fin du scénario, en secondes. */
  endAt: number;
  entities: Record<EntityType, Record<string, Record<string, string>>>;
  mails: Mail[];
  steps: Step[];
  /** Appelé à chaque pas d'horloge (balises répétées, etc.). */
  repeat?: (g: Game) => void;
  noise: (g: Game) => SimEvent;
  /** Le joueur a saisi ses identifiants sur une fausse page (lien ou QR code). */
  onPlayerCreds?: (g: Game) => void;
  threats: Threat[];
  actionsFor: (type: EntityType, value: string) => ActionId[];
  judge: (g: Game, type: EntityType, action: ActionId, value: string) => [Verdict, string];
  hint: (g: Game) => string | null;
  outcome: (g: Game) => { title: string; tone: "ok" | "warn" | "ko"; cap: number };
  /** Nombre de messages piégés reçus par le joueur (pour le taux de signalement). */
  phishTotal: (g: Game) => number;
  /** Description courte de la variante tirée (affichée dans le rapport). */
  variantLabel: string;
}

export interface ScenarioDef {
  id: string;
  title: Localized;
  summary: Localized;
  basedOn: Localized;
  skills: Localized[];
  create: (ctx: { lang: Lang; level: Level; rng: () => number }) => ScenarioInstance;
}

export const START = 8 * 3600; // 08:00
export const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 3600 + m * 60 - START;
};
