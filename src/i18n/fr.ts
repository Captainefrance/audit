export const fr = {
  "nav.label": "Navigation principale",
  "nav.home": "Accueil",
  "nav.about": "À propos",
  "lang.label": "Langue",
  "lang.fr": "FR",
  "lang.en": "EN",
  "lang.fr.full": "Français",
  "lang.en.full": "English",
  "banner.fallback":
    "Cette page n'est pas encore disponible dans cette langue. La version française est affichée.",
  "footer.rights": "Tous droits réservés.",
} as const;

export type Dict = Record<keyof typeof fr, string>;
