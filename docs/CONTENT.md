# Ajouter du contenu

Aucune modification de code n'est nécessaire pour les cas ci-dessous. Chaque push sur `main` redéploie le site.
Avant de pousser : `npm run check && npm run build`.

Les brouillons (`draft: true`) sont visibles avec `npm run dev` et absents du build de production.

## Ajouter une news

1. Créer `src/content/news/fr/<slug>.md` (le nom de fichier devient l'URL : `/fr/news/<slug>/`).
2. Front matter :

   ```yaml
   ---
   translationKey: mon-article        # identique dans toutes les langues
   title: "Titre"
   date: 2026-03-15
   source:
     name: Nom de la source
     url: https://exemple.org/article
   tags: [tag-un, tag-deux]           # alimente le filtre de la liste
   draft: false
   ---
   ```

3. Le corps Markdown est le commentaire personnel. Il peut rester vide.

La liste (tri par date décroissante, filtre par tag, pagination au-delà de 12), le flux RSS (`/<lang>/news/rss.xml`) et le sitemap se mettent à jour seuls.

## Ajouter une traduction

- **News ou fiche outil** : créer le même fichier dans l'autre dossier de langue (`en/`), avec le **même `translationKey`**. Le slug peut différer.
  Sans version EN, la version FR est servie sous `/en/...` avec un bandeau, et exclue du sitemap.
- **Textes d'interface** (menus, boutons) : `src/i18n/fr.ts` et `src/i18n/en.ts`. Le typage impose les mêmes clés dans les deux fichiers.
- **Page statique** (accueil, à propos) : traduire son contenu dans la page, puis ajouter `"en"` dans `src/i18n/pages.ts`.

## Ajouter une couche ou un outil d'architecture

Tout part de `src/data/architecture.ts`.

- **Couche** : ajouter un objet à `layers` (`id`, `name` en `fr` et `en`, `tools`). L'ordre du tableau est l'ordre d'empilement, du haut vers le bas.
- **Outil** : ajouter `{ id, category, name, hasPage }` dans les `tools` de sa couche.
- **Fiche outil** (si `hasPage: true`) : créer `src/content/tools/fr/<id>.md` et `en/<id>.md`. Le nom de fichier doit être l'`id` de l'outil.

  ```yaml
  ---
  translationKey: <id>
  name: "Nom affiché sur la fiche"
  layer: <id de la couche>           # doit correspondre à architecture.ts
  draft: false
  ---
  ```

  Le corps Markdown est l'explication technique.

Le build échoue si un `id` est en double, si une fiche ne correspond à aucun outil, ou si `layer` diffère de la couche déclarée.
Si `hasPage: true` mais qu'aucune fiche publiée n'existe, l'outil s'affiche sans lien et le build émet un avertissement.

`draft: true` sur une couche ou un outil le masque en production.

Tant qu'aucune couche n'est publiée, `/fr/architecture/` affiche l'ancienne page « à venir ».

## Liens, dépendances et texte des couches (page Architecture)

Dans `src/data/architecture.ts` :

- **Lien** entre deux outils : ajouter `{ from: "<id>", to: "<id>", type: "flux" }` dans `links`.
  Types : `flux`, `authentification`, `sauvegarde`, `supervision`, `administration`. Chaque type a un motif de tirets et une couleur ;
  la légende du schéma est générée depuis les types réellement utilisés.
  Libellés FR/EN des types : `linkTypeLabels` (même fichier). Nouveau type : l'ajouter à `LinkType`, `linkTypeLabels`, `linkTypeOrder`
  et définir son style `.link-<type>` dans `src/styles/global.css`.
- **Dépendance** : `dependsOn: ["<id>", ...]` sur un outil. Ce n'est pas un lien dessiné : c'est ce qui doit fonctionner pour que l'outil
  fonctionne (utilisé plus tard pour la panne en cascade et les scénarios). Les cycles et les ids inconnus font échouer le build.
- **Texte d'une couche** affiché au défilement : `src/content/layers/fr/<id de la couche>.md` (et `en/`).

  ```yaml
  ---
  translationKey: <id de la couche>   # identique au nom du fichier
  draft: false
  ---
  ```

  Le corps Markdown est le texte du panneau. Corps vide ou fichier absent : pas de panneau pour cette couche.
  Si aucune couche n'a de texte, la page affiche le schéma complet, sans effet au défilement.
  Sans version EN, le texte FR est repris (balisé `lang="fr"`).

Sous 768 px, le schéma sticky est remplacé par des couches empilées (avec leur texte) ; avec `prefers-reduced-motion`,
toutes les couches restent visibles et seule la mise en évidence suit le défilement.

## Nœuds externes (attaquant, Internet, utilisateur…)

Dans `src/data/architecture.ts`, tableau `externals` :

```ts
{ id: "ext-internet", kind: "internet", name: { fr: "Internet", en: "Internet" }, placement: "top" }
```

- `kind` : `attacker`, `internet`, `user` ou `other` (couleur et libellé d'accessibilité, en plus du tracé en pointillés).
- `placement` : `"top"` (défaut, au-dessus des couches) ou `"bottom"`. Dessiné hors des couches, et présent dans la liste mobile.
- Utilisable comme extrémité de `links` et dans les scénarios (`nodes`, `links`, `focus`) avec les mêmes règles de validation que les outils.
- Les ids sont partagés avec les outils : un id ne peut pas exister deux fois. Pas de fiche, pas de `dependsOn`.
- `canFail: true` : ce nœud peut « tomber » en mode panne et un outil peut en dépendre (`dependsOn`). Par défaut il ne tombe jamais ;
  un `dependsOn` vers un externe sans `canFail` fait échouer le build.

## `dependsOn` et mode panne

`dependsOn: ["B"]` sur A signifie **A tombe si B tombe** (transitivement). En mode panne, mettre B hors service éteint A, puis les
outils qui dépendent de A, etc. Un élément tombé par dépendance ne peut pas être rétabli directement : on rétablit sa cause.

## Scénarios (modes Attaque et Flux)

Un fichier par scénario : `src/data/scenarios/<id>.ts` (le nom de fichier doit être l'`id`). Aucun autre fichier à modifier.
Copier `attack-example.ts` (mode `"attack"`) ou `flow-example.ts` (mode `"flow"`).

```ts
export default defineScenario({
  id: "mon-scenario",
  mode: "attack",                     // "attack" | "flow"
  title: { fr: "…", en: "…" },
  description: { fr: "…", en: "…" },  // facultatif
  trail: true,                        // étapes passées restent allumées ; défaut true
  draft: false,
  steps: [
    {
      nodes: ["ext-attacker"],                              // ids d'outils ou de nœuds externes
      links: [{ from: "ext-attacker", to: "ext-internet" }], // liens déjà déclarés dans `links`
      focus: "ext-attacker",                                // facultatif : où s'affiche la caption (défaut nodes[0])
      tag: "T1190",                                         // facultatif : petite étiquette sans lien
      caption: { fr: "…", en: "…" },                        // "" = pas de texte
      durationMs: 4000,                                     // facultatif, lecture auto
    },
  ],
});
```

- **Ajouter une étape** : un objet de plus dans `steps`. Ordre du tableau = ordre de lecture.
- Un lien de scénario doit exister dans `links` (`type` seulement s'il existe plusieurs types entre les mêmes nœuds).
- `focus` doit faire partie de `nodes` ou être une extrémité d'un lien de l'étape.
- Build en erreur : id ≠ nom de fichier, id en double, nœud ou lien inconnu, aucune étape, scénario publié qui référence un élément `draft`.
- Caption EN vide : la caption FR est reprise (balisée `lang="fr"`). Caption vide dans les deux langues : simple avertissement.
- **Brouillons** : `draft: true` = visible uniquement en `astro dev`. Le sélecteur de mode ne propose que les modes qui ont au moins
  un scénario visible : si tous sont en `draft`, il n'affiche que « Panne ».
- **Lecture** : ne démarre jamais seule (bouton Lecture) ; absente avec `prefers-reduced-motion` (étapes manuelles).
  Clavier : Espace lecture/pause, ← → étapes, Début/Fin. Sur mobile, les éléments de la liste sont surlignés et la caption s'affiche sous l'élément actif.

## Pages hors navigation

`/comparatif`, `/souverainete` et `/demo` restent dans le repo, sans lien de menu, en `noindex`, hors sitemap.
