const HEADER =
  "flex shrink-0 items-center justify-center rounded-full block-header-badge inline-header-badge";

export const BADGE_LOOKS = {
  count: "rounded-badge bg-accent font-medium text-on-accent",
  condition:
    "inline-flex shrink-0 items-center gap-xs rounded-full bg-accent-soft text-detail font-semibold",
  filter:
    "inline-flex shrink-0 items-center gap-2xs rounded-control border border-border bg-card text-small font-medium",
  secondary:
    "inline-flex items-center rounded-label-badge bg-chip px-sm py-2xs text-caption font-medium text-on-chip",
  outline:
    "inline-flex items-center rounded-label-badge border border-border px-sm py-2xs text-caption font-medium",
  "header-accent": `${HEADER} bg-accent-soft text-accent`,
  "header-danger": `${HEADER} bg-danger-soft text-danger`,
} satisfies Record<string, string>;

export type BadgeLook = keyof typeof BADGE_LOOKS;
