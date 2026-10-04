export function focusPageHeading(): void {
  document.querySelector<HTMLHeadingElement>("main h1")?.focus();
}
