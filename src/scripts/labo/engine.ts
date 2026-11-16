/**
 * Moteur du Labo SOC : horloge du scénario, messagerie façon Outlook, console SIEM, actions de
 * réponse, menaces, rapport. Générique : tout le contenu vient d'un ScenarioDef (src/data/labo).
 * Compatible routeur client (onPageLoad) : minuteries et écouteurs nettoyés au changement de page.
 */
import { onPageLoad } from "../../lib/page-lifecycle";
import { SCENARIOS } from "../../data/labo";
import { UI, fill } from "../../lib/labo/i18n";
import {
  START,
  type ActionId,
  type EntityType,
  type Game,
  type Lang,
  type Level,
  type Mail,
  type ScenarioDef,
  type ScenarioInstance,
  type SimEvent,
  type SourceId,
  type StageId,
  type Verdict,
} from "../../lib/labo/types";

type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Kid = Node | string | null | undefined | false | Kid[];
const el = (tag: string, attrs: Attrs = {}, ...kids: Kid[]) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "class") n.className = String(v);
    else if (k === "text") n.textContent = String(v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v as EventListener);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  const add = (kid: Kid) => {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) kid.forEach(add);
    else n.append(kid);
  };
  kids.forEach(add);
  return n;
};

const fmt = (t: number) => {
  const s = START + Math.floor(t);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}`;
};
const fmtS = (t: number) => `${fmt(t)}:${String(Math.floor(START + t) % 60).padStart(2, "0")}`;
const mulberry = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

const LEVEL_CFG: Record<Level, { rate: number; noise: [number, number]; toasts: boolean; hints: boolean; minutes: number }> = {
  discovery: { rate: 6, noise: [45, 90], toasts: true, hints: true, minutes: 8 },
  analyst: { rate: 8, noise: [25, 60], toasts: true, hints: false, minutes: 6 },
  expert: { rate: 10, noise: [10, 28], toasts: false, hints: false, minutes: 5 },
};
const SOURCES: SourceId[] = ["mail", "proxy", "identity", "edr", "cloud", "report"];
const STAGE_ORDER: StageId[] = ["delivery", "click", "compromise", "persistence", "collection", "impact"];

interface Ev extends SimEvent { id: number; t: number }
interface Alert { id: number; t: number; title: string; sev: string; entity?: { type: EntityType; value: string } }
interface InboxMail extends Mail { read: boolean; status: "inbox" | "reported" | "trash" | "purged" }
interface Applied { t: number; type: EntityType; value: string; action: ActionId; verdict: Verdict; note: string }
interface LogLine { t: number; who: "attacker" | "you"; text: string; verdict?: Verdict }

export function startSession(container: HTMLElement, def: ScenarioDef, level: Level, seed: number, lang: Lang, onExit: (replay?: { same: boolean }) => void) {
  const ui = UI[lang];
  const cfg = LEVEL_CFG[level];
  const rng = mulberry(seed);
  const sc: ScenarioInstance = def.create({ lang, level, rng });
  const ctl = new AbortController();
  const { signal } = ctl;

  const S = {
    t: 0, running: false, speed: 1, ended: false, started: false, fast: false, closing: false,
    app: "mail" as "mail" | "siem",
    mails: [] as InboxMail[], folder: "inbox" as InboxMail["status"], openMail: null as string | null, showHeaders: false, showAddr: false,
    events: [] as Ev[], seq: 0, alerts: [] as Alert[], newAlerts: 0,
    iocs: [] as { type: EntityType; value: string }[], filters: [] as { type: EntityType; value: string }[], sources: new Set<SourceId>(),
    entity: null as { type: EntityType; value: string } | null, pinned: new Set<number>(),
    applied: new Map<string, number>(), actions: [] as Applied[], log: [] as LogLine[], fired: new Set<number>(),
    flags: {} as Record<string, unknown>, firstDetection: null as number | null, containedAt: {} as Record<string, number>,
    mailScore: { falseReports: 0, creds: false }, nextNoise: 15, dirtyMail: true, dirtySiem: true,
  };
  const key = (a: ActionId, v: string) => `${a}|${v}`;

  /* ---------------------------------------------------------------- API du scénario */
  const g: Game = {
    get t() { return S.t; },
    level, lang, rng,
    flags: S.flags,
    applied: (a, v) => S.applied.has(key(a, v)),
    appliedAt: (a, v) => S.applied.get(key(a, v)),
    event: (e) => emit(e),
    mail: (m) => deliver({ ...m, at: S.t }),
    attack: (text) => S.log.push({ t: S.t, who: "attacker", text }),
    reported: (id) => S.mails.some((m) => m.id === id && m.status === "reported"),
  };

  function emit(e: SimEvent) {
    const ev: Ev = { sev: "", ...e, id: ++S.seq, t: S.t };
    S.events.unshift(ev);
    S.dirtySiem = true;
    if (e.alert) {
      S.alerts.unshift({ id: ev.id, t: S.t, title: e.alert, sev: e.sev || "moyenne", entity: e.alertEntity });
      S.newAlerts++;
      toast(e.sev === "haute" ? "ko" : "", fill(ui.alertToast, { sev: ui.sev[(e.sev || "moyenne") as "haute"] }), e.alert, () => switchApp("siem"));
    }
  }
  function deliver(m: Mail) {
    if (S.mails.some((x) => x.id === m.id)) return;
    S.mails.unshift({ ...m, read: false, status: "inbox" });
    S.dirtyMail = true;
    toast(m.phish === "bec" ? "ko" : "", fill(ui.newMail, { from: m.from }), m.subject, () => { switchApp("mail"); S.folder = "inbox"; openMail(m.id); });
  }
  const youLog = (text: string, verdict?: Verdict) => S.log.push({ t: S.t, who: "you", text, verdict });

  /* ---------------------------------------------------------------- horloge */
  const isActive = (th: ScenarioInstance["threats"][number]) => th.active(g);
  function tick(dt: number) {
    if (S.ended) return;
    const prev = S.t;
    S.t += dt;
    for (const m of sc.mails) if (m.at > prev - 1e-9 && m.at <= S.t) deliver(m);
    sc.steps.forEach((step, i) => {
      if (S.fired.has(i) || S.t < step.at) return;
      S.fired.add(i);
      if (!step.when || step.when(g)) step.run(g);
    });
    sc.repeat?.(g);
    if (S.t >= S.nextNoise) {
      emit(sc.noise(g));
      S.nextNoise = S.t + cfg.noise[0] + rng() * (cfg.noise[1] - cfg.noise[0]);
    }
    for (const th of sc.threats) if (!(th.id in S.containedAt) && isActive(th) && th.contained(g)) S.containedAt[th.id] = S.t;
    if (S.t >= sc.endAt && !S.closing) endGame(ui.endOfShift);
    else render(false);
  }
  let timer = 0;
  let modalOpen = false;
  function setRunning(on: boolean) {
    S.running = on && !S.ended && !modalOpen && S.started;
    const p = q("[data-pause]");
    p.setAttribute("aria-pressed", String(!S.running));
    p.textContent = S.running ? ui.pause : ui.resume;
    clearInterval(timer);
    if (S.running) timer = window.setInterval(() => tick(0.25 * cfg.rate * S.speed), 250);
  }
  signal.addEventListener("abort", () => clearInterval(timer));

  /* ---------------------------------------------------------------- actions */
  function doAction(type: EntityType, value: string, action: ActionId) {
    const [verdict, note] = sc.judge(g, type, action, value);
    S.applied.set(key(action, value), S.t);
    S.actions.push({ t: S.t, type, value, action, verdict, note });
    youLog(`${ui.actions[action]} · ${value}`, verdict);
    toast(verdict === "utile" ? "ok" : verdict === "impact" ? "ko" : "", verdict === "utile" ? ui.actionApplied : verdict === "impact" ? ui.actionImpact : ui.actionUseless, note, undefined, true);
    if (action === "purge") for (const m of S.mails) if (m.addr.endsWith("@" + value) && m.status === "inbox") m.status = "purged";
    S.dirtyMail = S.dirtySiem = true;
    tick(0);
    render();
  }

  /* ---------------------------------------------------------------- squelette */
  container.replaceChildren(
    el("div", { class: "sysbar" },
      el("div", { class: "brand" }, el("span", { class: "logo", text: "N" }), el("span", { text: "Nordis" }), el("span", { class: "brand-sub", text: `· ${def.title[lang]}` })),
      el("div", { class: "apps", role: "tablist", "aria-label": ui.apps },
        el("button", { class: "app-tab", role: "tab", id: "lab-tab-mail", "aria-controls": "lab-app-mail", "aria-selected": "true", onclick: () => switchApp("mail") }, ui.mailApp, " ", el("span", { class: "count", "data-badge-mail": true, hidden: true })),
        el("button", { class: "app-tab", role: "tab", id: "lab-tab-siem", "aria-controls": "lab-app-siem", "aria-selected": "false", tabindex: -1, onclick: () => switchApp("siem") }, ui.siemApp, " ", el("span", { class: "count alert", "data-badge-siem": true, hidden: true }))
      ),
      el("span", { class: "spacer" }),
      el("span", { class: "status-pill", "data-threat-pill": true }, el("i"), el("span", { "data-threat-txt": true, text: ui.noThreat })),
      el("div", { class: "clock" },
        el("span", { class: "small muted", text: `${ui.levels[level]} · ${ui.day}` }),
        el("b", { "data-clock": true, text: "08:00" }),
        el("button", { class: "ctrl", "data-pause": true, "aria-pressed": "true", onclick: () => setRunning(!S.running) }, ui.resume),
        el("button", { class: "ctrl", "data-speed": true, title: ui.speed, "aria-label": ui.speed, onclick: () => { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 0.5 : 1; q("[data-speed]").textContent = "×" + S.speed; setRunning(S.running); } }, "×1")
      )
    ),
    ...(cfg.hints ? [el("div", { class: "hintbar", "aria-live": "polite" }, el("b", { text: ui.hint + " · " }), el("span", { "data-hint": true }))] : []),
    el("div", { class: "screen" },
      el("section", { id: "lab-app-mail", role: "tabpanel", "aria-labelledby": "lab-tab-mail" },
        el("div", { class: "mail" },
          el("nav", { class: "folders", "aria-label": ui.inbox, "data-folders": true }),
          el("div", { class: "list" },
            el("div", { class: "list-head" }, el("h3", { "data-folder-title": true }), el("span", { class: "small muted", "data-folder-count": true })),
            el("ul", { "data-mail-list": true })
          ),
          el("div", { class: "reader", "data-reader": true })
        )
      ),
      el("section", { id: "lab-app-siem", role: "tabpanel", "aria-labelledby": "lab-tab-siem", hidden: true },
        el("div", { class: "siem" },
          el("div", { class: "col col-l" },
            el("div", {}, el("div", { class: "sect-h" }, el("h4", { text: ui.alerts }), el("span", { class: "small muted", "data-al-count": true })), el("ul", { class: "alerts", "data-alerts": true })),
            el("div", {}, el("div", { class: "sect-h" }, el("h4", { text: ui.iocs }), el("span", { class: "small muted", "data-ioc-count": true })), el("ul", { class: "iocs", "data-iocs": true }))
          ),
          el("div", { class: "col col-c" },
            el("div", { class: "query" },
              el("div", { class: "qbar", "data-qbar": true, "aria-label": ui.filters }),
              el("div", { class: "qmeta" }, el("div", { class: "srcs", "data-srcs": true, role: "group", "aria-label": ui.sources }), el("span", { "data-qcount": true }))
            ),
            el("div", { class: "table-wrap" },
              el("table", {},
                el("thead", {}, el("tr", {}, el("th", { class: "th-pin" }, el("span", { class: "sr-only", text: ui.colCase })), el("th", { text: ui.colTime }), el("th", { text: ui.colSource }), el("th", { text: ui.colHost }), el("th", { text: ui.colUser }), el("th", { text: ui.colEvent }), el("th", { text: ui.colDetail }))),
                el("tbody", { "data-events": true })
              )
            )
          ),
          el("div", { class: "col col-r" }, el("div", { "data-entity": true }), el("div", { class: "case", "data-case": true }))
        )
      )
    ),
    el("div", { class: "toasts", "data-toasts": true, "aria-live": "polite" }),
    el("div", { "data-modal-root": true })
  );
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => container.querySelector<T>(sel)!;

  for (const id of ["#lab-tab-mail", "#lab-tab-siem"]) {
    q(id).addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).key;
      if (k !== "ArrowRight" && k !== "ArrowLeft") return;
      e.preventDefault();
      switchApp(S.app === "mail" ? "siem" : "mail");
      q(S.app === "mail" ? "#lab-tab-mail" : "#lab-tab-siem").focus();
    }, { signal });
  }

  /* ---------------------------------------------------------------- messagerie */
  const FOLDERS: { id: InboxMail["status"]; label: string }[] = [
    { id: "inbox", label: ui.inbox },
    { id: "reported", label: ui.reportedFolder },
    { id: "trash", label: ui.trash },
  ];
  function renderFolders() {
    q("[data-folders]").replaceChildren(
      el("button", { class: "new-btn", disabled: true, title: ui.notInSim }, ui.newMessage),
      ...FOLDERS.map((f) => {
        const n = S.mails.filter((m) => m.status === f.id && (f.id !== "inbox" || !m.read)).length;
        return el("button", { class: "folder", "data-fk": "folder-" + f.id, "aria-current": S.folder === f.id ? "true" : false, onclick: () => { S.folder = f.id; S.openMail = null; render(); } },
          el("span", { text: f.label }), el("span", { class: "n", text: n ? String(n) : "" }));
      })
    );
  }
  const preview = (m: Mail) => (m.body.find((b) => typeof b === "string" && b.length > 20) as string | undefined) ?? "";
  function renderList() {
    const items = S.mails.filter((m) => m.status === S.folder);
    q("[data-folder-title]").textContent = FOLDERS.find((f) => f.id === S.folder)!.label;
    q("[data-folder-count]").textContent = items.length ? fill(ui.messages, { n: items.length }) : "";
    const list = q("[data-mail-list]");
    if (!items.length) { list.replaceChildren(el("li", { class: "empty", text: ui.noMessage })); return; }
    list.replaceChildren(...items.map((m) => el("li", {}, el("button", {
      class: "mi" + (m.read ? "" : " unread"), "data-fk": "mail-" + m.id, "aria-current": S.openMail === m.id ? "true" : false, onclick: () => openMail(m.id),
    },
      el("span", { class: "row1" }, el("span", { class: "from", text: m.from }), el("span", { class: "time", text: fmt(m.at) })),
      el("span", { class: "subj", text: m.subject }),
      el("span", { class: "prev", text: preview(m) }),
      (m.attachment || !m.internal || m.status === "reported") ? el("span", { class: "tags" },
        !m.internal ? el("span", { class: "chip warn", text: ui.external }) : null,
        m.attachment ? el("span", { class: "chip", text: ui.attachment }) : null,
        m.status === "reported" ? el("span", { class: "chip ko", text: ui.reportedTag }) : null) : null
    ))));
  }
  function openMail(id: string) {
    S.openMail = id; S.showHeaders = false; S.showAddr = false;
    const m = S.mails.find((x) => x.id === id);
    if (m) m.read = true;
    render();
  }
  const hoverUrl = (u: string) => { const b = container.querySelector("[data-urlbar]"); if (b) b.textContent = u ? ui.linkTo + u : ""; };
  function qrSvg(text: string) {
    // QR « décoratif » déterministe : une vraie lecture n'est pas nécessaire dans la simulation.
    const n = 21; let h = 0;
    for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const r = mulberry(h);
    const cells: string[] = [];
    const finder = (x: number, y: number) => x < 7 && y < 7 || x >= n - 7 && y < 7 || x < 7 && y >= n - 7;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let on: boolean;
      if (finder(x, y)) { const fx = x % (n - 7) < 7 ? x % (n - 7) : x; const lx = x >= n - 7 ? x - (n - 7) : x; const ly = y >= n - 7 ? y - (n - 7) : y; on = lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4); void fx; }
      else on = r() > 0.52;
      if (on) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
    const wrap = el("div", { class: "qr", role: "img", "aria-label": ui.qrAlt });
    wrap.innerHTML = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" width="148" height="148" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#111">${cells.join("")}</g></svg>`;
    return wrap;
  }
  function renderReader() {
    const box = q("[data-reader]");
    const m = S.mails.find((x) => x.id === S.openMail);
    if (!m) { box.replaceChildren(el("div", { class: "empty", text: ui.selectMessage })); return; }
    const st = (r: string) => r === "pass" ? "good" : r === "fail" ? "bad" : "";
    const parts = m.body.map((b) => {
      if (typeof b === "string") return el("p", { class: "pre", text: b });
      if ("qr" in b) return el("div", { class: "qr-block" }, qrSvg(b.qr), el("p", { class: "small muted" }, ui.qrCaption, el("span", { class: "mono", text: b.qr })), el("button", { class: "tb", onclick: () => fakePage(m, b.qr) }, lang === "fr" ? "Scanner avec mon téléphone" : "Scan with my phone"));
      return el("p", {}, el("a", {
        href: "#", class: b.cta ? "cta" : "", text: b.link,
        onmouseenter: () => hoverUrl(b.url), onmouseleave: () => hoverUrl(""), onfocus: () => hoverUrl(b.url), onblur: () => hoverUrl(""),
        onclick: (e: Event) => { e.preventDefault(); if (b.phish) fakePage(m, b.url); else toast("", ui.internalLink, b.url.replace("https://", "") + ui.notOpened, undefined, true); },
      }));
    });
    box.replaceChildren(
      el("div", { class: "toolbar", role: "toolbar", "aria-label": ui.msgActions },
        el("button", { class: "tb report", "data-fk": "tb-report", disabled: m.status !== "inbox", onclick: () => report(m) }, ui.report),
        el("button", { class: "tb", disabled: m.status !== "inbox", onclick: () => { m.status = "trash"; S.openMail = null; render(); } }, ui.delete),
        el("button", { class: "tb", disabled: true, title: ui.notInSim }, ui.reply),
        el("button", { class: "tb", "data-fk": "tb-headers", onclick: () => { S.showHeaders = !S.showHeaders; renderReader(); } }, S.showHeaders ? ui.hideHeaders : ui.showHeaders)
      ),
      el("div", { class: "msg" },
        el("h2", { text: m.subject }),
        el("div", { class: "sender" },
          el("span", { class: "avatar", style: `background:${m.color}`, text: m.from.split(/\s+/).map((w) => w[0]).slice(0, 2).join("") }),
          el("div", { class: "who" },
            el("b", { text: m.from }), " ",
            S.showAddr ? el("span", { class: "addr", text: `<${m.addr}>` }) : el("button", { class: "linkbtn", onclick: () => { S.showAddr = true; renderReader(); } }, ui.showAddress),
            el("div", { class: "small muted", text: m.to ? (lang === "fr" ? "À : " : "To: ") + m.to : ui.to })
          ),
          el("span", { class: "mono small muted", text: fmt(m.at) })
        ),
        !m.internal ? el("div", { class: "banner ext", text: ui.externalBanner }) : null,
        S.showHeaders ? el("div", { class: "headers" },
          el("div", {}, el("span", { class: "k", text: "From: " }), m.addr),
          m.headers.returnPath ? el("div", {}, el("span", { class: "k", text: "Return-Path: " }), m.headers.returnPath) : null,
          el("div", {}, el("span", { class: "k", text: "Received: from " }), m.headers.relay),
          el("div", {}, el("span", { class: "k", text: "Authentication-Results: " }), "spf=", el("span", { class: st(m.headers.spf), text: m.headers.spf }), "; dkim=", el("span", { class: st(m.headers.dkim), text: m.headers.dkim }), "; dmarc=", el("span", { class: st(m.headers.dmarc), text: m.headers.dmarc })),
          m.headers.note ? el("div", { class: "note" }, el("span", { class: "k", text: ui.analystNote }), m.headers.note) : null
        ) : null,
        el("div", { class: "body" }, parts,
          m.attachment ? el("p", {}, el("button", { class: "attach", onclick: () => toast("", m.attachment!.name, m.attachment!.preview, undefined, true) },
            el("span", { class: "ext " + m.attachment.type, text: m.attachment.type.toUpperCase() }),
            el("span", {}, el("span", { class: "att-name", text: m.attachment.name }), el("span", { class: "small muted", text: m.attachment.size })))) : null
        )
      ),
      el("div", { class: "urlbar", "data-urlbar": true, "aria-live": "polite" })
    );
  }
  function report(m: InboxMail) {
    m.status = "reported";
    S.openMail = null;
    const domain = m.addr.split("@")[1];
    if (m.phish) {
      if (S.firstDetection === null) S.firstDetection = S.t;
      for (const i of m.ioc ?? []) if (!S.iocs.some((x) => x.value === i.value)) S.iocs.push(i);
      emit({ src: "report", host: "PC-SOC-01", user: "vous", ev: lang === "fr" ? "Hameçonnage signalé" : "Phishing reported", detail: `« ${m.subject} » ${m.addr}`, domain, sev: "moyenne", stage: "delivery", alert: (lang === "fr" ? "Signalement : " : "Report: ") + m.subject, alertEntity: m.phish === "bec" ? { type: "user", value: m.addr.split("@")[0] } : { type: "domain", value: domain } });
      youLog((lang === "fr" ? "Signalement de « " : "Reported “") + m.subject + (lang === "fr" ? " »" : "”"), "utile");
      toast("ok", ui.reportSent, fill(ui.iocAdded, { n: (m.ioc ?? []).length }), () => switchApp("siem"), true);
    } else {
      S.mailScore.falseReports++;
      youLog((lang === "fr" ? "Signalement d'un message légitime : « " : "Reported a legitimate message: “") + m.subject + (lang === "fr" ? " »" : "”"), "inutile");
      toast("", ui.reportSentNeutral, ui.reportNeutral, undefined, true);
    }
    S.dirtySiem = true;
    tick(0);
    render();
  }
  function fakePage(m: Mail, url: string) {
    modal((close) => el("div", { class: "dialog" },
      el("div", { class: "dialog-b" },
        el("p", { class: "label", text: ui.browser }),
        el("div", { class: "fakebrowser" },
          el("div", { class: "addrbar" }, el("span", { class: "lock", "aria-hidden": "true", text: "🔒" }), el("span", { text: url })),
          el("div", { class: "page" },
            el("div", { class: "ms-logo", "aria-hidden": "true" }, el("i", { style: "background:#F25022" }), el("i", { style: "background:#7FBA00" }), el("i", { style: "background:#00A4EF" }), el("i", { style: "background:#FFB900" })),
            el("b", { class: "ms-title", text: ui.signIn }),
            el("input", { id: "lab-fake-mail", value: lang === "fr" ? "vous@nordis.example" : "you@nordis.example", readonly: true, "aria-label": "E-mail" }),
            el("input", { id: "lab-fake-pwd", type: "password", value: "••••••••••", readonly: true, "aria-label": lang === "fr" ? "Mot de passe" : "Password" })
          )
        ),
        el("p", { class: "small muted", text: ui.lookAddress })
      ),
      el("div", { class: "dialog-f" },
        el("button", { class: "btn ghost", onclick: () => { close(); youLog(lang === "fr" ? `Ouverture de la page de « ${m.subject} », fermée sans rien saisir` : `Opened the page from “${m.subject}”, closed without typing`, "inutile"); toast("", ui.pageClosed, ui.pageClosedText, undefined, true); } }, ui.closePage),
        el("button", { class: "btn ms", onclick: () => { close(); S.mailScore.creds = true; youLog(lang === "fr" ? "Identifiants saisis sur la fausse page" : "Credentials entered on the fake page", "impact"); toast("ko", ui.credsSent, ui.credsSentText, () => switchApp("siem"), true); sc.onPlayerCreds?.(g); tick(0); } }, ui.signIn)
      )
    ));
  }

  /* ---------------------------------------------------------------- SIEM */
  function matches(ev: Ev) {
    if (S.sources.size && !S.sources.has(ev.src)) return false;
    return S.filters.every((f) => {
      if (f.type === "user") return ev.user === f.value;
      if (f.type === "host") return ev.host === f.value;
      if (f.type === "ip") return ev.ip === f.value || ev.detail.includes(f.value);
      return ev.domain === f.value || ev.detail.includes(f.value);
    });
  }
  function addFilter(type: EntityType, value: string) {
    if (!S.filters.some((f) => f.type === type && f.value === value)) S.filters.push({ type, value });
    S.entity = { type, value };
    render();
  }
  const known = (v: string) => S.iocs.some((i) => i.value === v);
  function pv(type: EntityType, value: string | undefined, fk: string) {
    if (!value) return el("span", { class: "muted", text: "—" });
    return el("button", { class: "pv" + (known(value) ? " ioc-hit" : ""), "data-fk": fk, title: fill(ui.pivot, { v: value }), onclick: () => addFilter(type, value) }, value);
  }
  function detailNode(e: Ev) {
    const tokens = ([e.ip ? ["ip", e.ip] : null, e.domain ? ["domain", e.domain] : null].filter(Boolean)) as [EntityType, string][];
    let text = e.detail;
    const parts: Kid[] = [];
    for (const [type, v] of tokens) {
      const idx = text.indexOf(v);
      const btn = pv(type, v, `pvd-${e.id}-${type}`);
      if (idx < 0) { parts.push(" ", btn); continue; }
      parts.push(text.slice(0, idx), btn);
      text = text.slice(idx + v.length);
    }
    parts.push(text);
    return el("span", { class: "mono small" }, parts);
  }
  function renderSiem() {
    // Alertes
    q("[data-al-count]").textContent = S.alerts.length ? String(S.alerts.length) : "";
    q("[data-alerts]").replaceChildren(...(S.alerts.length ? S.alerts.map((a) => el("li", {}, el("button", {
      class: `al ${a.sev}${S.t - a.t < 60 ? " new" : ""}`, "data-fk": "al-" + a.id,
      onclick: () => { S.filters = []; if (a.entity) addFilter(a.entity.type, a.entity.value); else render(); },
    }, el("span", { class: "t", text: a.title }), el("span", { class: "m", text: `${fmt(a.t)} · ${ui.sev[a.sev as "haute"] || a.sev}` })))) : [el("li", { class: "small muted", text: ui.noAlert })]));
    // Indicateurs
    q("[data-ioc-count]").textContent = S.iocs.length ? String(S.iocs.length) : "";
    q("[data-iocs]").replaceChildren(...(S.iocs.length ? S.iocs.map((i) => el("li", {}, el("button", { class: "ioc", "data-fk": "ioc-" + i.value, onclick: () => { S.filters = []; addFilter(i.type, i.value); } }, el("span", { text: ui.fields[i.type] }), i.value))) : [el("li", { class: "small muted", text: ui.noIoc })]));
    // Requête
    q("[data-qbar]").replaceChildren(
      ...(S.filters.length ? S.filters.map((f, i) => el("span", { class: "fchip" }, `${ui.fields[f.type]} = ${f.value}`,
        el("button", { "aria-label": fill(ui.removeFilter, { v: f.value }), "data-fk": `fx-${i}`, onclick: () => { S.filters.splice(i, 1); render(); } }, "×"))) : [el("span", { class: "ph", text: ui.filterHint })]),
      ...(S.filters.length ? [el("button", { class: "ctrl push", "data-fk": "fx-clear", onclick: () => { S.filters = []; render(); } }, ui.clear)] : [])
    );
    q("[data-srcs]").replaceChildren(...SOURCES.map((s) => el("button", { class: "src-f", "data-fk": "src-" + s, "aria-pressed": S.sources.has(s) ? "true" : "false", onclick: () => { if (S.sources.has(s)) S.sources.delete(s); else S.sources.add(s); render(); } }, ui.sourcesNames[s])));
    // Événements
    const rows = S.events.filter(matches);
    q("[data-qcount]").textContent = fill(ui.events, { n: rows.length, total: S.events.length });
    q("[data-events]").replaceChildren(...rows.slice(0, 250).map((e) => el("tr", { class: (S.pinned.has(e.id) ? "pinned " : "") + (S.t - e.t < 30 ? "fresh" : "") },
      el("td", {}, el("button", { class: "pin", "data-fk": "pin-" + e.id, "aria-pressed": S.pinned.has(e.id) ? "true" : "false", "aria-label": ui.pin, title: ui.pin, onclick: () => { if (S.pinned.has(e.id)) S.pinned.delete(e.id); else S.pinned.add(e.id); render(); } }, "◆")),
      el("td", { class: "t", text: fmtS(e.t) }),
      el("td", {}, el("span", { class: "src-tag", text: ui.sourcesNames[e.src] })),
      el("td", {}, pv("host", e.host, `pvh-${e.id}`)),
      el("td", {}, pv("user", e.user, `pvu-${e.id}`)),
      el("td", {}, el("span", { class: "sev-dot " + (e.sev || "") }), e.ev),
      el("td", {}, detailNode(e))
    )));
    // Entité
    const ent = S.entity;
    if (!ent) q("[data-entity]").replaceChildren(el("div", { class: "entity" }, el("p", { class: "label", text: ui.entity }), el("p", { class: "small muted", text: ui.entityHint })));
    else {
      const facts = sc.entities[ent.type]?.[ent.value] ?? {};
      const related = S.events.filter((e) => e.user === ent.value || e.host === ent.value || e.ip === ent.value || e.domain === ent.value || e.detail.includes(ent.value)).length;
      q("[data-entity]").replaceChildren(el("div", { class: "entity" },
        el("p", { class: "label", text: ui.fields[ent.type] }),
        el("h3", { text: ent.value }),
        el("dl", { class: "facts" }, Object.entries(facts).map(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]), el("dt", { text: ui.relatedEvents }), el("dd", { text: String(related) })),
        el("div", { class: "acts" }, sc.actionsFor(ent.type, ent.value).map((a) => {
          const done = S.applied.has(key(a, ent.value));
          const danger = a === "disable" || a === "isolate";
          return el("button", { class: "act" + (danger ? " danger" : "") + (done ? " done" : ""), "data-fk": "act-" + a, onclick: () => doAction(ent.type, ent.value, a) }, el("span", { text: ui.actions[a] }), el("span", { "aria-hidden": "true", text: done ? "✓" : "→" }));
        }))
      ));
    }
    // Dossier
    const pinned = S.events.filter((e) => S.pinned.has(e.id));
    const covered = new Set(pinned.map((e) => e.stage).filter(Boolean));
    const active = sc.threats.filter(isActive);
    q("[data-case]").replaceChildren(
      el("div", { class: "sect-h" }, el("h4", { text: ui.caseFile }), el("span", { class: "small muted", text: fill(ui.proofs, { n: pinned.length }) })),
      el("div", {}, el("p", { class: "label lab-gap", text: ui.chain }), el("div", { class: "stages" }, STAGE_ORDER.map((k) => el("span", { class: "stage" + (covered.has(k) ? " on" : ""), text: ui.stages[k] })))),
      el("div", {}, el("p", { class: "label lab-gap", text: ui.threatsTitle }),
        active.length ? el("ul", { class: "threats" }, active.map((th) => el("li", { class: th.contained(g) ? "done" : "open" }, el("i"), el("span", { text: th.name + (th.contained(g) ? ` · ${ui.contained}` : "") })))) : el("p", { class: "small muted", text: ui.nothingYet })),
      el("button", { class: "btn", "data-fk": "close-case", disabled: !S.started || S.ended, onclick: () => endGame(ui.closedByAnalyst) }, ui.close)
    );
  }

  /* ---------------------------------------------------------------- rendu */
  function render(force = true) {
    q("[data-clock]").textContent = fmt(S.t);
    const unread = S.mails.filter((m) => m.status === "inbox" && !m.read).length;
    const bm = q("[data-badge-mail]"); bm.hidden = !unread; bm.textContent = String(unread);
    if (S.app === "siem") S.newAlerts = 0;
    const bs = q("[data-badge-siem]"); bs.hidden = !S.newAlerts; bs.textContent = String(S.newAlerts);
    const open = sc.threats.filter((th) => isActive(th) && !th.contained(g) && (th.id !== "campaign" || S.iocs.length > 0 || S.alerts.length > 0));
    q("[data-threat-pill]").classList.toggle("threat", open.length > 0);
    q("[data-threat-txt]").textContent = open.length ? fill(ui.threats, { n: open.length }) : ui.noThreat;
    if (cfg.hints) { const h = sc.hint(g); q("[data-hint]").textContent = h ?? ""; }
    const needMail = S.app === "mail" && (force || S.dirtyMail);
    const needSiem = S.app === "siem" && (force || S.dirtySiem);
    if (!needMail && !needSiem) return;
    const fk = (document.activeElement as HTMLElement | null)?.dataset?.fk;
    if (needMail) { renderFolders(); renderList(); renderReader(); S.dirtyMail = false; }
    if (needSiem) { renderSiem(); S.dirtySiem = false; }
    if (fk && container.contains(document.activeElement) === false) container.querySelector<HTMLElement>(`[data-fk="${CSS.escape(fk)}"]`)?.focus({ preventScroll: true });
  }
  function switchApp(app: "mail" | "siem") {
    S.app = app;
    for (const [id, a] of [["#lab-tab-mail", "mail"], ["#lab-tab-siem", "siem"]] as const) {
      const t = q(id); t.setAttribute("aria-selected", String(a === app)); t.tabIndex = a === app ? 0 : -1;
    }
    q("#lab-app-mail").hidden = app !== "mail";
    q("#lab-app-siem").hidden = app !== "siem";
    render();
  }

  /* ---------------------------------------------------------------- notifications et fenêtres */
  function toast(tone: string, title: string, text: string, onclick?: () => void, always = false) {
    if (S.fast || (!cfg.toasts && !always)) return;
    const box = q("[data-toasts]");
    const t = el("button", { class: "toast " + (tone || ""), onclick: () => { t.remove(); onclick?.(); } }, el("b", { text: title }), el("span", { text }));
    box.prepend(t);
    while (box.children.length > 3) box.lastChild?.remove();
    window.setTimeout(() => t.remove(), 6000);
  }
  function modal(build: (close: () => void) => HTMLElement, opts: { resume?: boolean } = {}) {
    const wasRunning = S.running;
    modalOpen = true; clearInterval(timer); S.running = false;
    const root = q("[data-modal-root]");
    const prevFocus = document.activeElement as HTMLElement | null;
    const close = () => { root.replaceChildren(); modalOpen = false; if (wasRunning || opts.resume) setRunning(true); prevFocus?.focus?.(); };
    const ov = el("div", { class: "overlay", role: "dialog", "aria-modal": "true" }, build(close));
    ov.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key !== "Tab") return;
      const f = [...ov.querySelectorAll<HTMLElement>("button, input, a[href]")].filter((x) => !(x as HTMLButtonElement).disabled);
      if (!f.length) return;
      if ((e as KeyboardEvent).shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!(e as KeyboardEvent).shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    root.replaceChildren(ov);
    (ov.querySelector<HTMLElement>(".btn:not(.ghost)") ?? ov.querySelector<HTMLElement>("button"))?.focus();
  }

  /* ---------------------------------------------------------------- briefing et rapport */
  function briefing() {
    modal((close) => el("div", { class: "dialog wide" },
      el("div", { class: "dialog-b" },
        el("p", { class: "label", text: `${def.title[lang]} · ${ui.levels[level]}` }),
        el("h2", { class: "dlg-title", text: ui.briefingTitle }),
        el("p", { text: sc.briefing.context }),
        el("div", { class: "brief-grid" },
          el("div", { class: "brief-card" }, el("b", { text: ui.mailTitle }), el("ul", {}, ui.mailTips.map((x) => el("li", { text: x })))),
          el("div", { class: "brief-card" }, el("b", { text: ui.siemTitle }), el("ul", {}, ui.siemTips.map((x) => el("li", { text: x })))),
          el("div", { class: "brief-card" }, el("b", { text: ui.goalsTitle }), el("ul", {}, sc.briefing.objectives.map((x) => el("li", { text: x }))))
        ),
        el("p", { class: "small muted", text: fill(ui.briefingNote, { level: ui.levels[level], min: cfg.minutes, variant: sc.variantLabel }) })
      ),
      el("div", { class: "dialog-f" }, el("button", { class: "btn", onclick: () => { S.started = true; close(); setRunning(true); tick(0); } }, ui.start))
    ));
  }

  function endGame(reason: string) {
    if (S.ended || S.closing) return;
    if (S.t < sc.endAt) {
      // Clore tôt ne fige pas l'attaque : la suite est jouée instantanément avec les mesures prises.
      S.closing = true; S.fast = true; clearInterval(timer); S.running = false;
      youLog(ui.simulatedRest);
      while (S.t < sc.endAt) tick(30);
      S.fast = false;
    }
    S.ended = true; clearInterval(timer); S.running = false;
    for (const th of sc.threats) if (!(th.id in S.containedAt) && isActive(th) && th.contained(g)) S.containedAt[th.id] = S.t;
    const threats = sc.threats.filter(isActive).map((th) => {
      const when = S.containedAt[th.id];
      return { name: th.name, when, inTime: when !== undefined && when <= th.deadline };
    });
    const pinned = S.events.filter((e) => S.pinned.has(e.id));
    const covered = new Set(pinned.map((e) => e.stage).filter(Boolean));
    const reachable = new Set(S.events.map((e) => e.stage).filter(Boolean));
    const impacts = S.actions.filter((a) => a.verdict === "impact").length;
    const useless = S.actions.filter((a) => a.verdict === "inutile").length;
    const phishTotal = sc.phishTotal(g);
    const reported = S.mails.filter((m) => m.status === "reported" && m.phish).length;
    const out = sc.outcome(g);

    let score = 0;
    const critical = sc.threats.filter((th) => th.id !== "you");
    for (const th of critical) {
      const t = threats.find((x) => x.name === th.name);
      score += !t ? 12 : t.inTime ? 12 : t.when !== undefined ? 5 : 0; // jamais déclenchée = bien joué aussi
    }
    score = Math.round((score / (12 * Math.max(1, critical.length))) * 55);
    score += Math.round((15 * Math.min(reported, phishTotal)) / Math.max(1, phishTotal));
    score += Math.round((15 * covered.size) / Math.max(1, reachable.size));
    score += S.firstDetection !== null && S.firstDetection <= 9 * 60 ? 15 : S.firstDetection !== null && S.firstDetection <= 15 * 60 ? 8 : 0;
    score -= 3 * S.mailScore.falseReports + (S.mailScore.creds ? 15 : 0) + 6 * impacts + useless;
    score = Math.max(0, Math.min(out.cap, score));
    try {
      const k = `labo:best:${def.id}:${level}`;
      const best = Number(localStorage.getItem(k) ?? 0);
      if (score > best) localStorage.setItem(k, String(score));
    } catch { /* stockage indisponible : sans conséquence */ }

    const lines = [...S.log].sort((a, b) => a.t - b.t);
    modal(() => el("div", { class: "dialog wide" },
      el("div", { class: "dialog-b" },
        el("p", { class: "label", text: `${ui.reportTitle} · ${reason} · ${fmt(S.t)} · ${ui.levels[level]} · ${ui.variant} ${seed % 10000}` }),
        el("div", { class: "result-head" },
          el("div", {}, el("span", { class: "score-big", text: String(score) }), el("span", { class: "muted", text: " / 100" })),
          el("div", {}, el("h2", { class: `dlg-title tone-${out.tone}`, text: out.title }), el("p", { class: "small muted", text: ui.scoreExplain }))
        ),
        el("div", { class: "stats" },
          el("div", { class: "stat" }, el("b", { text: S.firstDetection !== null ? fmt(S.firstDetection) : "—" }), el("span", { text: ui.firstDetection })),
          el("div", { class: "stat" }, el("b", { text: `${reported}/${phishTotal}` }), el("span", { text: ui.phishReported })),
          el("div", { class: "stat" }, el("b", { text: `${covered.size}/${reachable.size}` }), el("span", { text: ui.provenStages })),
          el("div", { class: "stat" }, el("b", { text: String(impacts) }), el("span", { text: ui.impactActions }))
        ),
        el("div", {}, el("h3", { class: "lab-gap", text: ui.threatsTitle }),
          el("ul", { class: "threats" }, threats.length ? threats.map((th) => el("li", { class: th.when !== undefined ? "done" : "open" }, el("i"), el("span", { text: `${th.name} — ${th.when === undefined ? ui.notContained : fill(ui.containedAt, { t: fmt(th.when) }) + (th.inTime ? ui.inTime : ui.tooLate)}` }))) : el("li", {}, el("span", { class: "muted", text: ui.noThreatHappened })))),
        el("div", {}, el("h3", { class: "lab-gap", text: ui.timeline }),
          el("ol", { class: "timeline" }, lines.map((l) => el("li", {},
            el("span", { class: "mono muted", text: fmt(l.t) }),
            el("span", { class: l.who === "attacker" ? "who-a" : "who-y", text: l.who === "attacker" ? ui.attacker : ui.you }),
            el("span", {}, l.text, l.verdict ? el("span", { class: "v-" + l.verdict, text: ` · ${ui.verdict[l.verdict]}` }) : null,
              l.verdict ? el("span", { class: "note small muted", text: S.actions.find((a) => a.t === l.t && l.text.startsWith(ui.actions[a.action]))?.note ?? "" }) : null)
          ))))
      ),
      el("div", { class: "dialog-f" },
        el("button", { class: "btn ghost", onclick: () => onExit() }, ui.backToLab),
        el("button", { class: "btn ghost", onclick: () => onExit({ same: true }) }, ui.replaySame),
        el("button", { class: "btn", onclick: () => onExit({ same: false }) }, ui.replayNew)
      )
    ));
  }

  // Raccourci : Échap ferme la notification la plus récente ; la page masquée met en pause.
  document.addEventListener("visibilitychange", () => { if (document.hidden && S.running) setRunning(false); }, { signal });

  render();
  briefing();
  return { destroy: () => { ctl.abort(); clearInterval(timer); container.replaceChildren(); } };
}

/* ---------------------------------------------------------------- page Labo */
onPageLoad((signal) => {
  const root = document.querySelector<HTMLElement>("[data-labo]");
  if (!root) return;
  const lang: Lang = document.documentElement.lang === "en" ? "en" : "fr";
  const hub = root.querySelector<HTMLElement>("[data-labo-hub]")!;
  const stage = root.querySelector<HTMLElement>("[data-labo-game]")!;
  let session: { destroy: () => void } | null = null;
  let last: { id: string; level: Level; seed: number } | null = null;

  // Meilleurs scores mémorisés dans le navigateur.
  for (const b of root.querySelectorAll<HTMLElement>("[data-best]")) {
    try { const v = localStorage.getItem(`labo:best:${b.dataset.best}`); if (v) { b.textContent = b.dataset.tpl!.replace("{n}", v); b.hidden = false; } } catch { /* rien */ }
  }

  const launch = (id: string, level: Level, seed: number) => {
    const def = SCENARIOS.find((s) => s.id === id);
    if (!def) return;
    last = { id, level, seed };
    session?.destroy();
    hub.hidden = true;
    stage.hidden = false;
    stage.scrollIntoView({ block: "start" });
    session = startSession(stage, def, level, seed, lang, (replay) => {
      session?.destroy(); session = null;
      if (replay && last) launch(last.id, last.level, replay.same ? last.seed : (Math.random() * 1e9) | 0);
      else { stage.hidden = true; hub.hidden = false; hub.querySelector<HTMLElement>("h1")?.focus(); }
    });
  };

  for (const btn of root.querySelectorAll<HTMLButtonElement>("[data-start]")) {
    btn.addEventListener("click", () => {
      const card = btn.closest<HTMLElement>("[data-scenario]")!;
      const level = (card.querySelector<HTMLInputElement>("input[type=radio]:checked")?.value ?? "analyst") as Level;
      launch(card.dataset.scenario!, level, (Math.random() * 1e9) | 0);
    }, { signal });
  }
  root.dataset.ready = "true";
  signal.addEventListener("abort", () => { session?.destroy(); session = null; });
});
