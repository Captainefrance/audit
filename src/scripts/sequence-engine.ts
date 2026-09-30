import { onPageLoad, reducedMotion } from "../lib/page-lifecycle";
import { resetDiagram, setState } from "../lib/diagram-state";
import { computeOutage, computeStepStates, linkMatches, type SimLinkRef, type SimScenario } from "../lib/sequence";

// Moteur de séquence : UN moteur, trois modes (attaque, flux, panne) sur le même schéma.
// Lecture jamais spontanée (bouton Lecture) ; absente sous prefers-reduced-motion (étapes manuelles).
// Pilote les `data-node` / `data-link` du schéma de simulation (SVG ≥ md et liste < md).

type Mode = "attack" | "flow" | "outage";

interface SimData {
  lang: string;
  modes: Mode[];
  scenarios: SimScenario[];
  names: Record<string, string>;
  linkLabels: Record<string, string>;
  outage: { deps: Record<string, string[]>; failable: string[] };
  i18n: Record<"play" | "pause" | "restart" | "step" | "links" | "outageCount" | "outageNone" | "outageDown" | "outageCascade", string>;
}

const fill = (tpl: string, values: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));

onPageLoad((signal) => {
  const root = document.querySelector<HTMLElement>("[data-sim]");
  const raw = root?.querySelector("#sim-data")?.textContent;
  const diagram = root?.querySelector<HTMLElement>("[data-diagram]");
  if (!root || !raw || !diagram) return;
  const data: SimData = JSON.parse(raw);
  const $ = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;

  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panel = $("#sim-panel");
  const scenarioUi = $("[data-sim-scenario-ui]");
  const outageUi = $("[data-sim-outage-ui]");
  const chooser = $("[data-sim-chooser]");
  const chooserButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-scenario]")];
  const titleEl = $("[data-sim-title]");
  const descEl = $("[data-sim-description]");
  const prevBtn = $<HTMLButtonElement>("[data-sim-prev]");
  const playBtn = $<HTMLButtonElement>("[data-sim-play]");
  const nextBtn = $<HTMLButtonElement>("[data-sim-next]");
  const countEl = $("[data-sim-count]");
  const tagEl = $("[data-sim-tag]");
  const progress = $("[data-sim-progress]");
  const bar = $("[data-sim-bar]");
  const captionText = $("[data-sim-caption-text]");
  const captionLinks = $("[data-sim-caption-links]");
  const resetBtn = $<HTMLButtonElement>("[data-sim-reset]");
  const statusEl = $("[data-sim-status]");

  // Éléments du schéma, par id (SVG et liste mobile partagent les `data-node`).
  const nodesById = new Map<string, Element[]>();
  for (const el of diagram.querySelectorAll("[data-node]")) {
    const id = el.getAttribute("data-node")!;
    nodesById.set(id, [...(nodesById.get(id) ?? []), el]);
  }
  const allNodeIds = [...nodesById.keys()];
  const linkEls = [...diagram.querySelectorAll<SVGPathElement>("path[data-link]")];
  const slots = [...diagram.querySelectorAll<HTMLElement>("[data-caption-slot]")];
  const failable = new Set(data.outage.failable);

  let mode: Mode = data.modes[0];
  let scenario: SimScenario | null = null;
  let step = 0;
  let playing = false;
  let timer = 0;
  const manualDown = new Set<string>();
  let interactiveCtl: AbortController | null = null;

  const setDisabled = (btn: HTMLButtonElement, off: boolean) => btn.setAttribute("aria-disabled", String(off));
  const isDisabled = (btn: HTMLButtonElement) => btn.getAttribute("aria-disabled") === "true";
  /** Élément qui porte le rôle / le focus : la pastille de la liste mobile, ou le groupe SVG. */
  const interactiveTarget = (el: Element) => (el.querySelector<HTMLElement>(".node-item") ?? el) as HTMLElement;
  const nameOf = (id: string) => data.names[id] ?? id;
  const setStates = (id: string, state: "active" | "visited" | "dim" | "down" | null) => {
    for (const el of nodesById.get(id) ?? []) setState(el, state);
  };

  // ---------- Scénarios (attaque, flux) ----------

  const linkLine = (refs: SimLinkRef[]) => {
    const parts: string[] = [];
    for (const ref of refs) {
      const types = linkEls
        .filter((l) => linkMatches(ref, l.dataset.from!, l.dataset.to!, l.dataset.type!))
        .map((l) => data.linkLabels[l.dataset.type!]);
      const label = types.length > 0 ? ` (${[...new Set(types)].join(", ")})` : "";
      parts.push(`${nameOf(ref.from)} → ${nameOf(ref.to)}${label}`);
    }
    return parts.length > 0 ? `${data.i18n.links} : ${parts.join(" ; ")}` : "";
  };

  const hideSlots = () => {
    for (const slot of slots) {
      slot.hidden = true;
      slot.replaceChildren();
    }
  };

  const updatePlayButton = () => {
    const last = !!scenario && step >= scenario.steps.length - 1;
    playBtn.textContent = playing ? data.i18n.pause : last ? data.i18n.restart : data.i18n.play;
  };

  const paintStep = () => {
    if (!scenario) return;
    const total = scenario.steps.length;
    const current = scenario.steps[step];
    const { nodes, activeLinks, visitedLinks } = computeStepStates(scenario, step, allNodeIds);
    for (const [id, state] of nodes) setStates(id, state);
    for (const link of linkEls) {
      const { from, to, type } = link.dataset as { from: string; to: string; type: string };
      const on = activeLinks.some((r) => linkMatches(r, from, to, type));
      const seen = visitedLinks.some((r) => linkMatches(r, from, to, type));
      setState(link, on ? "active" : seen ? "visited" : "dim");
    }

    // Caption : panneau (≥ md) + emplacement sous l'élément actif (< md).
    const links = linkLine(current.links);
    captionText.textContent = current.caption;
    captionLinks.textContent = links;
    if (current.captionLang !== data.lang) captionText.setAttribute("lang", current.captionLang);
    else captionText.removeAttribute("lang");
    hideSlots();
    if (current.caption || links) {
      for (const el of nodesById.get(current.focus) ?? []) {
        const slot = el.querySelector<HTMLElement>("[data-caption-slot]");
        if (!slot) continue;
        if (current.caption) {
          const p = document.createElement("span");
          p.className = "block text-ink";
          p.textContent = current.caption;
          if (current.captionLang !== data.lang) p.setAttribute("lang", current.captionLang);
          slot.append(p);
        }
        if (links) {
          const l = document.createElement("span");
          l.className = "mt-1 block text-xs text-slate";
          l.textContent = links;
          slot.append(l);
        }
        slot.hidden = false;
      }
    }

    const count = fill(data.i18n.step, { n: step + 1, total });
    countEl.textContent = count;
    progress.setAttribute("aria-valuemax", String(total));
    progress.setAttribute("aria-valuenow", String(step + 1));
    progress.setAttribute("aria-valuetext", count);
    (bar as HTMLElement).style.transform = `scaleX(${(step + 1) / total})`;
    tagEl.textContent = current.tag ?? "";
    tagEl.classList.toggle("hidden", !current.tag);
    // aria-disabled (et non disabled) : un bouton qui devient inactif ne fait pas perdre le focus clavier.
    setDisabled(prevBtn, step <= 0);
    setDisabled(nextBtn, step >= total - 1);
    updatePlayButton();
  };

  const pause = () => {
    clearTimeout(timer);
    if (playing) {
      playing = false;
      updatePlayButton();
    }
  };

  const schedule = () => {
    clearTimeout(timer);
    if (!scenario) return;
    timer = window.setTimeout(() => {
      if (!scenario || !playing) return;
      if (step < scenario.steps.length - 1) {
        step += 1;
        paintStep();
      }
      if (step < scenario.steps.length - 1) schedule();
      else pause();
    }, scenario.steps[step].durationMs);
  };

  const goTo = (index: number) => {
    if (!scenario) return;
    step = Math.min(Math.max(index, 0), scenario.steps.length - 1);
    paintStep();
    if (playing) schedule();
  };

  const play = () => {
    if (!scenario || reducedMotion()) return;
    if (step >= scenario.steps.length - 1) {
      step = 0;
      paintStep();
    }
    playing = true;
    updatePlayButton();
    schedule();
  };

  const selectScenario = (id: string) => {
    pause();
    scenario = data.scenarios.find((s) => s.id === id) ?? null;
    if (!scenario) return;
    step = 0;
    for (const b of chooserButtons) b.setAttribute("aria-pressed", String(b.dataset.scenario === id));
    titleEl.textContent = scenario.title;
    descEl.textContent = scenario.description ?? "";
    descEl.hidden = !scenario.description;
    resetDiagram(diagram);
    paintStep();
  };

  // ---------- Mode panne ----------

  const clearInteractive = () => {
    interactiveCtl?.abort();
    interactiveCtl = null;
    for (const els of nodesById.values()) {
      for (const el of els) {
        const target = interactiveTarget(el);
        if (target.dataset.simInteractive === undefined) continue;
        delete target.dataset.simInteractive;
        target.removeAttribute("tabindex");
        target.removeAttribute("aria-pressed");
        const role = target.dataset.simRole;
        if (role) target.setAttribute("role", role);
        else target.removeAttribute("role");
        delete target.dataset.simRole;
      }
    }
  };

  const paintOutage = (announce = true) => {
    const { down, cascaded } = computeOutage(data.outage.deps, manualDown);
    for (const id of allNodeIds) {
      setStates(id, down.has(id) ? "down" : null);
      for (const el of nodesById.get(id) ?? []) {
        const target = interactiveTarget(el);
        if (target.dataset.simInteractive === undefined) continue;
        target.setAttribute("aria-pressed", String(manualDown.has(id)));
        if (cascaded.has(id)) target.setAttribute("aria-disabled", "true");
        else target.removeAttribute("aria-disabled");
      }
    }
    for (const link of linkEls) {
      setState(link, down.has(link.dataset.from!) || down.has(link.dataset.to!) ? "down" : null);
    }
    if (!announce) return;
    const names = [...down].map(nameOf).join(", ");
    statusEl.textContent = down.size === 0 ? data.i18n.outageNone : `${fill(data.i18n.outageCount, { n: down.size })} : ${names}`;
    setDisabled(resetBtn, manualDown.size === 0);
  };

  const enterOutage = () => {
    manualDown.clear();
    resetDiagram(diagram);
    hideSlots();
    interactiveCtl = new AbortController();
    const local = interactiveCtl.signal;
    for (const id of failable) {
      for (const el of nodesById.get(id) ?? []) {
        const target = interactiveTarget(el);
        target.dataset.simInteractive = "true";
        if (target.getAttribute("role")) target.dataset.simRole = target.getAttribute("role")!;
        target.setAttribute("role", "button");
        target.setAttribute("tabindex", "0");
        target.setAttribute("aria-pressed", "false");
        const toggle = () => {
          const { cascaded } = computeOutage(data.outage.deps, manualDown);
          if (cascaded.has(id)) return; // tombé par dépendance : rien à basculer
          if (manualDown.has(id)) manualDown.delete(id);
          else manualDown.add(id);
          paintOutage();
        };
        target.addEventListener("click", toggle, { signal: local });
        target.addEventListener(
          "keydown",
          (e) => {
            if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") {
              e.preventDefault();
              toggle();
            }
          },
          { signal: local },
        );
      }
    }
    paintOutage();
  };

  // ---------- Modes, onglets ----------

  const selectMode = (next: Mode) => {
    pause();
    if (mode === "outage") clearInteractive();
    mode = next;
    scenario = null;
    resetDiagram(diagram);
    hideSlots();
    captionText.textContent = "";
    captionLinks.textContent = "";
    for (const tab of tabs) {
      const on = tab.dataset.mode === next;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) panel.setAttribute("aria-labelledby", tab.id);
    }
    const isOutage = next === "outage";
    scenarioUi.hidden = isOutage;
    outageUi.hidden = !isOutage;
    if (isOutage) {
      enterOutage();
      return;
    }
    const inMode = data.scenarios.filter((s) => s.mode === next);
    for (const b of chooserButtons) b.hidden = b.dataset.mode !== next;
    chooser.hidden = inMode.length < 2;
    if (inMode[0]) selectScenario(inMode[0].id);
  };

  // ---------- Écouteurs ----------

  for (const tab of tabs) {
    tab.addEventListener("click", () => selectMode(tab.dataset.mode as Mode), { signal });
    tab.addEventListener(
      "keydown",
      (e) => {
        const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
        if (!keys.includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const i = tabs.indexOf(tab);
        const j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[j].focus();
        selectMode(tabs[j].dataset.mode as Mode);
      },
      { signal },
    );
  }
  for (const b of chooserButtons) b.addEventListener("click", () => selectScenario(b.dataset.scenario!), { signal });
  prevBtn.addEventListener("click", () => { if (isDisabled(prevBtn)) return; pause(); goTo(step - 1); }, { signal });
  nextBtn.addEventListener("click", () => { if (isDisabled(nextBtn)) return; pause(); goTo(step + 1); }, { signal });
  playBtn.addEventListener("click", () => (playing ? pause() : play()), { signal });
  resetBtn.addEventListener("click", () => { if (isDisabled(resetBtn)) return; manualDown.clear(); paintOutage(); }, { signal });

  // Clavier (modes attaque / flux) : Espace, flèches, Début, Fin. Les boutons gardent leur Espace natif.
  root.addEventListener(
    "keydown",
    (e) => {
      if (mode === "outage" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, select, textarea")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); pause(); goTo(step + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); pause(); goTo(step - 1); }
      else if (e.key === "Home") { e.preventDefault(); pause(); goTo(0); }
      else if (e.key === "End") { e.preventDefault(); pause(); goTo(Infinity); }
      else if (e.key === " " && !target.closest("button")) { e.preventDefault(); playing ? pause() : play(); }
    },
    { signal },
  );

  // Lecture : jamais sous prefers-reduced-motion ; suspendue hors de l'écran et onglet masqué.
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const applyMotion = () => {
    playBtn.hidden = motion.matches;
    if (motion.matches) pause();
  };
  motion.addEventListener("change", applyMotion, { signal });
  applyMotion();
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => !e.isIntersecting)) pause();
  });
  observer.observe(root);
  document.addEventListener("visibilitychange", () => document.hidden && pause(), { signal });

  signal.addEventListener("abort", () => {
    clearTimeout(timer);
    observer.disconnect();
    clearInteractive();
  });

  selectMode(mode);
  root.dataset.simReady = "true";
});
