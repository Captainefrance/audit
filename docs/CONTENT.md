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

## Pages hors navigation

`/comparatif`, `/souverainete` et `/demo` restent dans le repo, sans lien de menu, en `noindex`, hors sitemap.
