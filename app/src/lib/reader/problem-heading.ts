import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone } from "#lib/page/platform.ts";

export type ProblemLayout = "row" | "startColumn" | "centredColumn";

const PHONE_LAYOUT = {
  android: "startColumn",
  ios: "centredColumn",
  linux: "row",
  macos: "row",
  windows: "row",
} as const satisfies Record<Platform, ProblemLayout>;

export const PROBLEM_HEAD = {
  row: "flex items-center gap-md",
  startColumn: "flex flex-col items-start gap-lg",
  centredColumn: "flex flex-col items-center gap-md text-center",
} as const satisfies Record<ProblemLayout, string>;

export const PROBLEM_TEXT = {
  row: "",
  startColumn: "",
  centredColumn: "text-center",
} as const satisfies Record<ProblemLayout, string>;

export function problemLayout(
  platform: Platform,
  width: WidthClass,
): ProblemLayout {
  return isPhone(platform, width) ? PHONE_LAYOUT[platform] : "row";
}
