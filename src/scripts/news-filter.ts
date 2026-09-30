import { onPageLoad, reducedMotion } from "../lib/page-lifecycle";

// Filtre par tag + pagination, côté client. Sans JS : toute la liste reste visible.
// Les changements de sélection sont animés en FLIP (Web Animations API) : les cartes qui
// restent glissent vers leur nouvelle place, celles qui apparaissent se fondent.
onPageLoad((signal) => {
  const root = document.querySelector<HTMLElement>("[data-news]");
  if (!root) return;

  const pageSize = Number(root.dataset.pageSize) || 12;
  const cards = [...root.querySelectorAll<HTMLElement>("[data-news-card]")];
  const items = cards.map((c) => c.closest("li")!);
  const filter = root.querySelector<HTMLElement>("[data-news-filter]");
  const pager = root.querySelector<HTMLElement>("[data-news-pagination]");
  const status = root.querySelector<HTMLElement>("[data-news-status]");
  const pageLabel = root.querySelector<HTMLElement>("[data-page-label]");
  const prev = root.querySelector<HTMLButtonElement>("[data-prev]");
  const next = root.querySelector<HTMLButtonElement>("[data-next]");
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-tag]")];
  const fill = (tpl: string | undefined, values: Record<string, number>) =>
    (tpl ?? "").replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));

  const params = new URLSearchParams(location.hash.slice(1));
  let tag = params.get("tag") ?? "";
  let page = Math.max(1, Number(params.get("page")) || 1);
  if (!buttons.some((b) => b.dataset.tag === tag)) tag = "";

  const DURATION = 280;
  const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  const running = new Set<Animation>();

  const render = (animate: boolean) => {
    // FLIP — First : positions avant changement.
    const first = new Map<HTMLElement, DOMRect>();
    if (animate) for (const li of items) if (!li.hidden) first.set(li, li.getBoundingClientRect());

    const matches = cards.filter((c) => !tag || (c.dataset.tags ?? "").split("|").includes(tag));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages);
    const visible = new Set(matches.slice((page - 1) * pageSize, page * pageSize));
    for (const c of cards) c.closest("li")!.hidden = !visible.has(c);

    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.tag === tag));
    if (status) status.textContent = fill(root.dataset.countTemplate, { n: matches.length });
    if (pager) pager.hidden = pages <= 1;
    if (pageLabel) pageLabel.textContent = fill(root.dataset.pageTemplate, { p: page, n: pages });
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= pages;

    const state = new URLSearchParams();
    if (tag) state.set("tag", tag);
    if (page > 1) state.set("page", String(page));
    const hash = state.toString();
    history.replaceState(history.state, "", hash ? `#${hash}` : location.pathname + location.search);

    if (!animate || reducedMotion()) return;
    for (const a of running) a.cancel();
    running.clear();
    // Last + Invert + Play.
    for (const li of items) {
      if (li.hidden) continue;
      const from = first.get(li);
      const to = li.getBoundingClientRect();
      const anim = from
        ? li.animate(
            [
              { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` },
              { transform: "translate(0, 0)" },
            ],
            { duration: DURATION, easing: EASING },
          )
        : li.animate([{ opacity: 0, transform: "scale(0.97)" }, { opacity: 1, transform: "scale(1)" }], {
            duration: DURATION,
            easing: EASING,
          });
      running.add(anim);
      anim.addEventListener("finish", () => running.delete(anim));
    }
  };

  if (filter) filter.dataset.ready = "true";
  for (const b of buttons) {
    b.addEventListener(
      "click",
      () => {
        tag = b.dataset.tag ?? "";
        page = 1;
        render(true);
      },
      { signal },
    );
  }
  prev?.addEventListener("click", () => { page -= 1; render(true); }, { signal });
  next?.addEventListener("click", () => { page += 1; render(true); }, { signal });
  signal.addEventListener("abort", () => {
    for (const a of running) a.cancel();
  });
  render(false);
});
