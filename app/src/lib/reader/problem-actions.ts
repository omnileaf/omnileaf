import type { ActionGroupLook } from "#lib/page/action-group.ts";

const BUTTON =
  "flex shrink-0 items-center justify-center gap-sm rounded-shadcn-button px-lg text-body font-medium whitespace-nowrap transition-control min-block-touch-target expanded:text-small expanded:min-block-pointer-button ios:rounded-ios-button ios:min-block-ios-control";

export const TODAYS_PROBLEM_ACTIONS: ActionGroupLook = {
  group: "flex flex-col items-center gap-sm expanded:flex-row",
  main: `${BUTTON} bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed`,
  other: `${BUTTON} border border-border bg-card disabled:opacity-60 ios:border-transparent ios:bg-ios-fill`,
};
