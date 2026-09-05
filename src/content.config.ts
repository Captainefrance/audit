import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const tools = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/tools" }),
  schema: z.object({
    nom: z.string(),
    categorie: z.enum([
      "PAM",
      "EDR",
      "SIEM",
      "IAM",
      "backup",
      "reseau",
      "autre",
    ]),
    utilite: z.string(),
    detail_technique: z.string(),
    avis_perso: z.string(),
    juridiction_hebergement: z.string(),
    souverain: z.boolean(),
  }),
});

export const collections = { tools };
