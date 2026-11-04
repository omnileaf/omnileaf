import type { AfterNavigate } from "$app/navigation";

import { ADMIN_BASE } from "#lib/paths.ts";

export type NavigationType = AfterNavigate["type"];

export type NavSection = "dashboard" | "reports";

export interface Focusable {
  focus(): void;
}

export interface HeadingRoot {
  querySelector(selector: string): Focusable | null;
}

const PAGE_HEADING = "main h1";
const REPORTS_SEGMENT = "reports";
const FOCUS_MOVING_NAVIGATIONS: ReadonlySet<NavigationType> = new Set([
  "link",
  "popstate",
]);

export function navSection(pathname: string): NavSection | undefined {
  if (pathname !== ADMIN_BASE && !pathname.startsWith(`${ADMIN_BASE}/`)) {
    return undefined;
  }
  const [first] = pathname
    .slice(ADMIN_BASE.length)
    .split("/")
    .filter((segment) => segment !== "");
  if (first === undefined) {
    return "dashboard";
  }
  return first === REPORTS_SEGMENT ? "reports" : undefined;
}

export function movesFocusToHeading(type: NavigationType): boolean {
  return FOCUS_MOVING_NAVIGATIONS.has(type);
}

export function focusPageHeading(root: HeadingRoot): void {
  root.querySelector(PAGE_HEADING)?.focus();
}

export function adoptsUrlAfter(type: NavigationType): boolean {
  return type !== "goto";
}
