import type { MoveFocus } from "#lib/move-focus.ts";
import { focusPageHeading } from "#lib/navigation.ts";

export function focusPageHeadingInDocument(): void {
  focusPageHeading({
    querySelector: (selector) => document.querySelector<HTMLElement>(selector),
  });
}

export function focusMoveTarget(target: MoveFocus): void {
  if (target.kind === "heading") {
    focusPageHeadingInDocument();
    return;
  }
  document.getElementById(target.id)?.focus();
}
