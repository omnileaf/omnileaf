export function focusPageHeading(): void {
  document.querySelector<HTMLHeadingElement>("main h1")?.focus();
}

/** Lands on the field a page is for, such as a search's, or else on the page's heading. */
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
