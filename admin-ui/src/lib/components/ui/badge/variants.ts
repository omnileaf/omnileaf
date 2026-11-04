export const BADGE_VARIANTS = {
  solid: "border-transparent bg-accent text-on-accent",
  soft: "border-transparent bg-accent-soft text-accent-ink",
  outline: "border-accent text-accent-ink",
  chip: "border-transparent bg-chip text-muted",
  "muted-outline": "border-border text-muted",
} satisfies Record<string, string>;

export type BadgeVariant = keyof typeof BADGE_VARIANTS;
