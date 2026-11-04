import { focusPageHeading } from "#lib/navigation.ts";

export function focusPageHeadingInDocument(): void {
  focusPageHeading({
    querySelector: (selector) => document.querySelector<HTMLElement>(selector),
  });
}
