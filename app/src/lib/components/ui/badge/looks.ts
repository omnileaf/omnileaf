const HEADER =
  "flex shrink-0 items-center justify-center rounded-full block-header-badge inline-header-badge";

export const BADGE_LOOKS = {
  count: "rounded-badge bg-accent font-medium text-on-accent",
  condition:
    "inline-flex shrink-0 items-center gap-xs rounded-full bg-accent-soft text-detail font-semibold",
  secondary:
    "inline-flex items-center rounded-shadcn-control bg-chip px-sm py-2xs text-caption font-medium text-foreground",
  outline:
    "inline-flex items-center rounded-shadcn-control border border-border px-sm py-2xs text-caption font-medium",
  "header-accent": `${HEADER} bg-accent-soft text-accent`,
  "header-danger": `${HEADER} bg-danger-soft text-danger`,
} satisfies Record<string, string>;

export type BadgeLook = keyof typeof BADGE_LOOKS;
