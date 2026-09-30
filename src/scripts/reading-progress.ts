import { onPageLoad } from "../lib/page-lifecycle";

// Repli JS de la barre de progression : là où `animation-timeline: scroll()` est supporté,
// le CSS suffit et ce script ne fait rien.
onPageLoad((signal) => {
  const bar = document.querySelector<HTMLElement>("[data-reading-progress]");
  if (!bar || CSS.supports("animation-timeline: scroll()")) return;

  const update = () => {
    const root = document.documentElement;
    const max = root.scrollHeight - root.clientHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0;
    bar.style.transform = `scaleX(${ratio})`;
  };
  update();
  addEventListener("scroll", update, { passive: true, signal });
  addEventListener("resize", update, { passive: true, signal });
});
