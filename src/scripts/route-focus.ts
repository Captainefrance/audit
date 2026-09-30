// Après une navigation du routeur client, place le focus sur <main> : le lecteur d'écran
// annonce la nouvelle zone (Astro annonce déjà le titre de page via son route announcer)
// et Tab repart du contenu. Pas de déplacement au chargement initial ni sur les ancres.
let navigated = false;
document.addEventListener("astro:after-swap", () => {
  navigated = true;
});
document.addEventListener("astro:page-load", () => {
  if (!navigated) return;
  navigated = false;
  if (location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)))) return;
  document.getElementById("main")?.focus({ preventScroll: true });
});
