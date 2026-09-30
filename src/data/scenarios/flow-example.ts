import { defineScenario } from "./types";

// Exemple factice (draft : jamais visible en production).
export default defineScenario({
  id: "flow-example",
  mode: "flow",
  title: { fr: "[Placeholder] Connexion à une ressource", en: "[Placeholder] Signing in to a resource" },
  draft: true,
  steps: [
    {
      nodes: ["ext-user"],
      links: [{ from: "ext-user", to: "tool-example-1", type: "authentification" }],
      caption: { fr: "[À rédiger]", en: "[To write]" },
    },
    {
      nodes: ["tool-example-1", "tool-example-2"],
      links: [{ from: "tool-example-1", to: "tool-example-2" }],
      focus: "tool-example-2",
      caption: { fr: "[À rédiger]", en: "[To write]" },
    },
    {
      nodes: ["tool-example-5"],
      links: [{ from: "tool-example-2", to: "tool-example-5" }],
      caption: { fr: "[À rédiger]", en: "[To write]" },
    },
  ],
});
