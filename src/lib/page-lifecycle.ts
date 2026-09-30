/**
 * Exécute `init` au chargement initial ET après chaque navigation du routeur client
 * (`astro:page-load`), avec un `AbortSignal` annulé avant chaque changement de page
 * (`astro:before-swap`) : tout listener ajouté avec `{ signal }` est retiré automatiquement,
 * donc aucun doublon après N navigations.
 *
 * Le module lui-même n'est évalué qu'une fois par rechargement complet : ne pas
 * enregistrer de listener hors de `init` sans `signal`.
 */
export function onPageLoad(init: (signal: AbortSignal) => void): void {
  let controller: AbortController | null = null;

  const run = () => {
    controller?.abort();
    controller = new AbortController();
    init(controller.signal);
  };
  const stop = () => {
    controller?.abort();
    controller = null;
  };

  document.addEventListener("astro:page-load", run);
  document.addEventListener("astro:before-swap", stop);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
