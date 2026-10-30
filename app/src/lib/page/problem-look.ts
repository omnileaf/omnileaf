import {
  type ButtonLook,
  type ButtonVariant,
  variantClasses,
} from "#lib/components/ui/button/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";

import { type ActionGroupLook, actionGroupLook } from "./action-group.ts";
import type { WidthClass } from "./breakpoints.ts";

export interface ProblemButton {
  readonly look?: ButtonLook;
  readonly variant?: ButtonVariant;
  readonly class: string;
}

export interface ProblemLook {
  readonly section: string;
  readonly icon: string;
  readonly iconSize: number;
  readonly glyph: string;
  readonly media: string;
  readonly bookTitle: string;
  readonly title: string;
  readonly body: string;
  readonly detail: string;
  readonly actions: string;
  readonly button: ProblemButton;
}

const TODAYS_LOOK: ProblemLook = {
  section:
    "gap-md pbs-2xl medium:pbs-3xl expanded:pbs-problem-top max-inline-problem",
  icon: "rounded-full bg-accent-soft text-accent block-header-badge inline-header-badge desktop:block-header-badge-desktop desktop:inline-header-badge-desktop",
  iconSize: 20,
  glyph: "desktop:block-header-icon-desktop desktop:inline-header-icon-desktop",
  media: "",
  bookTitle: "text-group-title font-semibold tracking-tight expanded:text-body",
  title: "text-problem-title font-bold tracking-tight",
  body: "text-reading text-muted desktop:text-reading-small",
  detail:
    "rounded-card bg-well px-list-row py-md font-mono text-caption break-all select-text",
  actions: "flex-col gap-sm self-stretch medium:flex-row medium:self-start",
  button: {
    look: "filled",
    class:
      "flex items-center justify-center rounded-full px-xl font-bold min-block-touch-target medium:rounded-control",
  },
};

const WINDOWS_LOOK: ProblemLook = {
  section: "gap-md pbs-xl max-inline-problem",
  icon: "text-foreground",
  iconSize: 24,
  glyph: "",
  media: "bg-transparent",
  bookTitle: "text-title font-semibold",
  title: "text-title font-semibold",
  body: "text-label font-regular",
  detail:
    "rounded-windows-control border border-windows-stroke bg-card px-md py-sm font-mono text-caption break-all select-text",
  actions: "flex-row gap-sm self-start",
  button: { variant: "primary", class: "" },
};

const PROBLEM_LOOKS = {
  android: TODAYS_LOOK,
  ios: TODAYS_LOOK,
  linux: TODAYS_LOOK,
  macos: TODAYS_LOOK,
  windows: WINDOWS_LOOK,
} satisfies Record<Platform, ProblemLook>;

export function problemLook(platform: Platform): ProblemLook {
  return PROBLEM_LOOKS[platform];
}

const WINDOWS_ACTION_GROUP: ActionGroupLook = {
  group: "flex flex-wrap items-center gap-sm",
  main: variantClasses("primary", "regular", false, "windows"),
  other: variantClasses("secondary", "regular", false, "windows"),
};

export function problemActionGroup(
  platform: Platform,
  width: WidthClass,
  today: ActionGroupLook,
): ActionGroupLook {
  return platform === "windows"
    ? WINDOWS_ACTION_GROUP
    : actionGroupLook(platform, width, today);
}
