import { onPageLoad } from "../lib/page-lifecycle";

// Lueur qui suit le curseur sur les `.spotlight`. Souris uniquement : au tactile et sous
// prefers-reduced-motion, le CSS affiche une lueur fixe (pas de suivi).
onPageLoad((signal) => {
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  if (!fine.matches || reduce.matches) return;

  let frame = 0;
  document.addEventListener(
    "pointermove",
    (event) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(".spotlight");
      if (!card) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        card.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    },
    { passive: true, signal },
  );
  signal.addEventListener("abort", () => cancelAnimationFrame(frame));
});
