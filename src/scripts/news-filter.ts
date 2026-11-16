/**
 * Veille : filtre par thème. La pastille glisse jusqu'au thème choisi et la grille se
 * réorganise via une View Transition du document (les cartes gardent leur nom de transition,
 * elles glissent donc à leur nouvelle place). Sans support ou en mouvement réduit : bascule directe.
 */
import { onPageLoad, reducedMotion } from "../lib/page-lifecycle";

const format = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

onPageLoad((signal) => {
  const root = document.querySelector<HTMLElement>("[data-news]");
  const bar = root?.querySelector<HTMLElement>("[data-news-filter]");
  if (!root || !bar) return;

  const chips = [...bar.querySelectorAll<HTMLButtonElement>("[data-tag]")];
  const pill = bar.querySelector<HTMLElement>(".nw-pill");
  const items = [...root.querySelectorAll<HTMLElement>(".nw-item")];
  const status = root.querySelector<HTMLElement>("[data-news-status]");
  const empty = root.querySelector<HTMLElement>("[data-news-empty]");
  const template = root.dataset.countTemplate ?? "{n}";

  const movePill = () => {
    const on = chips.find((c) => c.getAttribute("aria-pressed") === "true");
    if (!on || !pill) return;
    pill.style.width = `${on.offsetWidth}px`;
    pill.style.height = `${on.offsetHeight}px`;
    pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  };

  const apply = (tag: string) => {
    let n = 0;
    for (const chip of chips) chip.setAttribute("aria-pressed", String(chip.dataset.tag === tag));
    for (const item of items) {
      const show = !tag || (item.dataset.tags ?? "").split("|").includes(tag);
      item.hidden = !show;
      item.style.animation = "none"; // pas de rejeu de l'animation d'entrée
      if (show) n++;
    }
    if (status) status.textContent = format(template, { n, s: n > 1 ? "s" : "" });
    if (empty) empty.hidden = n > 0;
    movePill();
  };

  for (const chip of chips) {
    chip.addEventListener(
      "click",
      () => {
        const tag = chip.dataset.tag ?? "";
        if (chip.getAttribute("aria-pressed") === "true") return;
        if (reducedMotion() || !document.startViewTransition) apply(tag);
        else document.startViewTransition(() => apply(tag));
      },
      { signal },
    );
  }

  movePill();
  requestAnimationFrame(() => bar.setAttribute("data-ready", ""));
  window.addEventListener("resize", movePill, { signal });
  document.fonts?.ready.then(() => { if (!signal.aborted) movePill(); });
});
