const APP_NAVIGATION = "[data-app-navigation]";

export function focusedTabHref(): string | undefined {
  const focused = document.activeElement;
  if (
    !(focused instanceof HTMLAnchorElement) ||
    focused.closest(APP_NAVIGATION) === null
  ) {
    return undefined;
  }
  return focused.getAttribute("href") ?? undefined;
}

export function focusTab(href: string): void {
  const tab = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(`${APP_NAVIGATION} a`),
  ).find((link) => link.getAttribute("href") === href);
  tab?.focus();
}
