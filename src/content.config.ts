import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

// Un fichier .md par entrée et par langue : src/content/<collection>/{fr,en}/<slug>.md
// Les versions d'une même entrée partagent `translationKey`.
const news = defineCollection({
  loader: glob({ pattern: "{fr,en}/**/*.md", base: "./src/content/news" }),
  schema: z.object({
    translationKey: z.string(),
    title: z.string(),
    date: z.coerce.date(),
    source: z.object({ name: z.string(), url: z.url() }),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// Fiche outil : le nom de fichier (sans langue) doit être l'`id` de l'outil dans
// src/data/architecture.ts, et `layer` l'id de sa couche (vérifié au build).
const tools = defineCollection({
  loader: glob({ pattern: "{fr,en}/**/*.md", base: "./src/content/tools" }),
  schema: z.object({
    translationKey: z.string(),
    name: z.string(),
    layer: z.string(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { news, tools };
