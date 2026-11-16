/**
 * En-tête : îlot qui se resserre au défilement, indicateur qui glisse d'un lien à l'autre
 * (suit le survol et le focus, revient sur la page active), menu mobile plein écran.
 */
import { onPageLoad } from "../lib/page-lifecycle";

onPageLoad((signal) => {
  const header = document.querySelector<HTMLElement>("[data-header]");
  if (!header) return;

  // Îlot au défilement
  const onScroll = () => header.toggleAttribute("data-scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true, signal });

  // Indicateur glissant
  const list = header.querySelector<HTMLElement>("[data-links]");
  const ind = list?.querySelector<HTMLElement>(".hdr-ind");
  if (list && ind) {
    const links = [...list.querySelectorAll<HTMLAnchorElement>("a")];
    const active = () => links.find((a) => a.hasAttribute("aria-current")) ?? null;
    const moveTo = (a: HTMLElement | null) => {
      if (!a) { ind.style.width = "0"; return; }
      ind.style.width = `${a.offsetWidth}px`;
      ind.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    for (const a of links) {
      const go = () => { list.setAttribute("data-hover", ""); moveTo(a); };
      a.addEventListener("pointerenter", go, { signal });
      a.addEventListener("focus", go, { signal });
    }
    const back = () => { list.removeAttribute("data-hover"); moveTo(active()); };
    list.addEventListener("pointerleave", back, { signal });
    list.addEventListener("focusout", (e) => { if (!list.contains(e.relatedTarget as Node)) back(); }, { signal });
    moveTo(active());
    list.setAttribute("data-ready", "");
    requestAnimationFrame(() => list.setAttribute("data-animate", ""));
    window.addEventListener("resize", () => moveTo(active()), { signal });
    document.fonts?.ready.then(() => { if (!signal.aborted) moveTo(active()); });
  }

  // Menu mobile
  const button = header.querySelector<HTMLButtonElement>("[data-menu]");
  const sheet = header.querySelector<HTMLElement>("[data-sheet]");
  if (!button || !sheet) return;
  const setOpen = (open: boolean) => {
    button.setAttribute("aria-expanded", String(open));
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (open) {
      sheet.hidden = false;
      requestAnimationFrame(() => header.setAttribute("data-open", ""));
      sheet.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    } else {
      header.removeAttribute("data-open");
      sheet.hidden = true;
    }
  };
  button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"), { signal });
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && header.hasAttribute("data-open")) { setOpen(false); button.focus(); }
    },
    { signal },
  );
  // Passage en grand écran : le menu n'a plus lieu d'être.
  const wide = window.matchMedia("(min-width: 821px)");
  wide.addEventListener("change", () => { if (wide.matches) setOpen(false); }, { signal });
  signal.addEventListener("abort", () => { document.documentElement.style.overflow = ""; });
});
