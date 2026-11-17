export function focusedTabHref(): string | undefined {
  const focused = document.activeElement;
  if (
    !(focused instanceof HTMLAnchorElement) ||
    focused.closest("nav") === null
  ) {
    return undefined;
  }
  return focused.getAttribute("href") ?? undefined;
}

export function focusTab(href: string): void {
  const tab = [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find(
    (link) => link.getAttribute("href") === href,
  );
  tab?.focus();
}
