import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

// Un fichier .md par entrée et par langue : src/content/news/{fr,en}/<slug>.md
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

const tools = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/tools" }),
  schema: z.object({
    nom: z.string(),
    categorie: z.enum(["PAM", "EDR", "SIEM", "IAM", "backup", "reseau", "autre"]),
    utilite: z.string(),
    detail_technique: z.string(),
    avis_perso: z.string(),
    juridiction_hebergement: z.string(),
    souverain: z.boolean(),
  }),
});

export const collections = { news, tools };
