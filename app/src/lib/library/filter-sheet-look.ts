import { ChevronsUpDown } from "@lucide/svelte";

export const ANDROID_FILTER_SHEET = {
  header: "flex items-center gap-sm ps-lg pe-md pbe-xs",
  title:
    "flex-1 text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title",
  body: "flex flex-1 flex-col overflow-y-auto pbe-sm min-block-none",
  foot: "flex flex-col px-lg pbs-md pbe-native-sheet-foot-bottom",
  rule: "border-bs border-native-sheet-rule",
} as const;

export const FILTER_SETTING_LABEL_TYPE =
  "text-native-segment/native-segment font-native-segment tracking-native-segment";

export const ANDROID_FILTER_HEADING = `pbs-md pbe-sm ps-lg text-native-on-button-plain ${FILTER_SETTING_LABEL_TYPE}`;

export const ANDROID_FILTER_CHIP = {
  chip: "flex shrink-0 items-center gap-sm rounded-native-segment border px-lg text-native-button/native-button font-native-button tracking-native-button whitespace-nowrap block-auto min-block-native-button-small touch:touch-target-around",
  chosen: "border-transparent bg-native-accent-soft text-foreground",
  other: "border-native-button-outline-edge text-muted",
} as const;

export const ANDROID_VIEW_SETTING = {
  row: "flex flex-col gap-sm ps-lg pe-xl",
  words: "",
  note: "basis-full text-muted",
} as const;

export const MAC_INSPECTOR = {
  heading:
    "text-native-title-bar-title/native-title-bar-title font-native-title-bar-title tracking-native-title-bar-title",
  label:
    "text-native-inspector-label/native-inspector-label font-native-inspector-label",
  section:
    "gap-sm py-native-inspector-section border-be border-native-row-rule last:border-be-0",
  group: "flex flex-col gap-sm",
  note: "text-native-inspector-note/native-inspector-note text-muted",
  select: {
    fieldClass:
      "rounded-native-button border-0 bg-native-button-secondary ps-md text-native-button/native-button font-native-button block-native-button macos:shadow-none",
    icon: ChevronsUpDown,
    iconSize: 11,
  },
} as const;

export const MAC_INSPECTOR_CHIP = {
  group: "flex flex-wrap gap-native-inspector-chip-gap",
  chip: "flex shrink-0 items-center gap-xs rounded-native-button px-native-inspector-chip-inline text-native-button/native-button font-native-button tracking-native-button whitespace-nowrap inset-ring inset-ring-native-control-stroke transition-control min-block-native-button",
  iconSize: 12,
  chosen:
    "bg-native-accent-soft text-native-on-button-link active:inset-shadow-[0_0_0_100px_var(--color-native-row-rule)]",
  other:
    "bg-native-button-secondary text-native-on-button-secondary hover:bg-native-control-fill-hover active:bg-native-control-fill-pressed",
} as const;

export const MAC_INSPECTOR_SMART = {
  group:
    "flex flex-col overflow-hidden rounded-native-group bg-native-group px-native-inspector-group-inline",
  row: "flex items-center gap-md text-start inline-full min-block-native-inspector-row border-be border-native-row-rule last:border-be-0",
  words: "flex flex-1 flex-col py-sm",
  title: MAC_INSPECTOR.label,
  description:
    "text-native-inspector-note/native-inspector-note tracking-native-list-sub text-muted",
} as const;

export const MAC_INSPECTOR_PANEL = {
  aside:
    "fixed inset-y-none inset-e-none z-series-bar flex flex-col border-s border-native-top-bar-scrolled-edge bg-background inline-native-inspector",
  head: "flex items-center px-lg min-block-native-inspector-title",
  headRule: "border-be border-native-top-bar-scrolled-edge",
  title: MAC_INSPECTOR.heading,
  foot: "px-lg pbs-md pbe-lg",
  count: "flex-1 text-native-inspector-label/native-inspector-label",
  hasBadgeAndClose: false,
  reset: { variant: "secondary", size: "small" },
} as const;

export const DOCKED_PANEL = {
  aside:
    "sticky inset-bs-docked-top flex flex-col self-start border-s border-sidebar-edge bg-sidebar block-docked-fill",
  head: "flex items-center gap-md ps-lg pe-sm pbs-lg pbe-sm",
  headRule: "",
  title: "text-body font-semibold",
  foot: "ps-lg pe-sm pbs-md pbe-md",
  count: "flex-1 text-small",
  hasBadgeAndClose: true,
  reset: {
    look: "text",
    class: "rounded-badge px-sm text-small block-panel-button",
  },
} as const;
