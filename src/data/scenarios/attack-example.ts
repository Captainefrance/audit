import { defineScenario } from "./types";

// Exemple factice (draft : jamais visible en production).
export default defineScenario({
  id: "attack-example",
  mode: "attack",
  title: { fr: "[Placeholder] Scénario d'attaque", en: "[Placeholder] Attack scenario" },
  description: { fr: "[À rédiger]", en: "[To write]" },
  draft: true,
  steps: [
    {
      nodes: ["ext-attacker"],
      links: [{ from: "ext-attacker", to: "ext-internet" }],
      tag: "EX-1",
      caption: { fr: "[À rédiger]", en: "[To write]" },
    },
    {
      nodes: ["ext-internet", "tool-example-1"],
      links: [{ from: "ext-internet", to: "tool-example-1" }],
      focus: "tool-example-1",
      caption: { fr: "[À rédiger]", en: "[To write]" },
      durationMs: 5000,
    },
    {
      nodes: ["tool-example-4"],
      links: [{ from: "tool-example-1", to: "tool-example-4" }],
      tag: "EX-2",
      caption: { fr: "[À rédiger]", en: "[To write]" },
    },
    {
      nodes: ["tool-example-6"],
      links: [{ from: "tool-example-4", to: "tool-example-6" }],
      caption: { fr: "", en: "" }, // vide : rien sous l'élément
    },
  ],
});
