export function focusPageHeading(): void {
  document.querySelector<HTMLHeadingElement>("main h1")?.focus();
}

export function focusArrival(): void {
  const field = document.querySelector<HTMLElement>(
    "main [data-arrival-focus]",
  );
  if (field === null) {
    focusPageHeading();
  } else {
    field.focus();
  }
}
