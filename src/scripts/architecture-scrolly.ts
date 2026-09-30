import { onPageLoad, reducedMotion } from "../lib/page-lifecycle";
import { highlightLayer, resetDiagram, revealUpTo } from "../lib/diagram-state";

// Scrollytelling de l'architecture : schéma sticky, les couches apparaissent une par une au
// défilement, la couche active est mise en évidence, son texte est mis en avant.
//  - < 768 px : pas de sticky ni d'apparition pilotée (couches empilées, animées à l'entrée en CSS).
//  - prefers-reduced-motion : tout reste visible ; seule la mise en évidence suit le défilement.
//  - Sans JS : tout est visible (le masquage initial n'existe que sous @media (scripting: enabled)).
onPageLoad((signal) => {
  const root = document.querySelector<HTMLElement>("[data-scrolly]");
  const diagram = root?.querySelector<HTMLElement>("[data-diagram]");
  if (!root || !diagram) return;

  const steps = [...root.querySelectorAll<HTMLElement>("[data-step]")];
  const desktop = matchMedia("(min-width: 768px)");
  let frame = 0;

  const setActiveStep = (index: number) => {
    steps.forEach((step, i) => {
      if (i === index) step.setAttribute("aria-current", "true");
      else step.removeAttribute("aria-current");
    });
  };

  const neutral = () => {
    resetDiagram(diagram);
    setActiveStep(-1);
    root.dataset.scrollyReady = "true";
  };

  // Étape « active » = celle qui contient la ligne de lecture (40 % du haut de l'écran).
  const compute = () => {
    if (!desktop.matches) return neutral();
    const line = innerHeight * 0.4;
    const rect = root.getBoundingClientRect();
    // Hors de la section : état remis à zéro (tout visible, rien de mis en évidence).
    if (rect.bottom < 0 || rect.top > innerHeight) return neutral();

    let active = 0;
    steps.forEach((step, i) => {
      if (step.getBoundingClientRect().top <= line) active = i;
    });
    const layerId = steps[active]?.dataset.layer ?? null;
    const visibleUpTo = reducedMotion() ? Infinity : active;
    revealUpTo(diagram, visibleUpTo);
    highlightLayer(diagram, layerId);
    setActiveStep(active);
    root.dataset.scrollyReady = "true";
  };

  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(compute);
  };

  // Pas d'écouteur de scroll : deux IntersectionObserver réveillent le calcul.
  //  - lineObserver : une étape franchit la ligne de lecture (bande de hauteur nulle à 40 %).
  //  - sectionObserver : la section entre dans l'écran ou en sort (remise à zéro).
  const lineObserver = new IntersectionObserver(schedule, { rootMargin: "-40% 0px -60% 0px" });
  const sectionObserver = new IntersectionObserver(schedule);
  for (const step of steps) lineObserver.observe(step);
  sectionObserver.observe(root);
  addEventListener("resize", schedule, { passive: true, signal });
  desktop.addEventListener("change", schedule, { signal });

  signal.addEventListener("abort", () => {
    lineObserver.disconnect();
    sectionObserver.disconnect();
    cancelAnimationFrame(frame);
    delete root.dataset.scrollyReady;
    resetDiagram(diagram);
  });
  compute();
});
