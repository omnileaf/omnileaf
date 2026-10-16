import type { WidthClass } from "#lib/page/breakpoints.ts";

export function showsSectionsBeside(width: WidthClass): boolean {
  return width === "expanded";
}
