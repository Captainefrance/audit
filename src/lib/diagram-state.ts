/**
 * API d'état du schéma d'architecture, partagée par le scrollytelling (Phase C) et le moteur
 * de séquence (Phase D). Le schéma expose des éléments identifiés par attributs :
 *
 *   [data-layer="<id>"]  [data-node="<id>"]  [data-link][data-from][data-to]
 *   [data-reveal-index="<n>"]  index de la couche qui « porte » l'élément (lien : max des deux)
 *
 * et le CSS réagit à `data-state` : "hidden" | "dim" | "active" | "down" (absent = visible).
 */

export type DiagramState = "hidden" | "dim" | "active" | "down";

export function setState(el: Element, state: DiagramState | null): void {
  if (state) el.setAttribute("data-state", state);
  else el.removeAttribute("data-state");
}

/** Remet tous les éléments du schéma à l'état neutre (tout visible, rien de mis en évidence). */
export function resetDiagram(root: ParentNode): void {
  for (const el of root.querySelectorAll("[data-state]")) el.removeAttribute("data-state");
}

/** Cache les éléments dont l'index de révélation dépasse `maxIndex` ; les autres restent visibles. */
export function revealUpTo(root: ParentNode, maxIndex: number): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-reveal-index]")) {
    const index = Number(el.dataset.revealIndex);
    setState(el, index > maxIndex ? "hidden" : null);
  }
}

/** Met en évidence une couche (et elle seule). */
export function highlightLayer(root: ParentNode, layerId: string | null): void {
  for (const el of root.querySelectorAll("[data-layer]")) {
    const on = layerId !== null && el.getAttribute("data-layer") === layerId;
    if (on) setState(el, "active");
    else if (el.getAttribute("data-state") === "active") setState(el, null);
  }
}
