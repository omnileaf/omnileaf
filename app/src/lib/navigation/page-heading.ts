export function focusPageHeading(options?: FocusOptions): void {
  document.querySelector<HTMLHeadingElement>("main h1")?.focus(options);
}

export function focusArrival(options: FocusOptions): void {
  const field = document.querySelector<HTMLElement>(
    "main [data-arrival-focus]",
  );
  if (field === null) {
    focusPageHeading(options);
  } else {
    field.focus(options);
  }
}
