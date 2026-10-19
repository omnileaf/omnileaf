const BACK_LINKS = "a[data-back-link], a[data-crumb-back]";

export function shownBackLink(root: ParentNode): HTMLAnchorElement | undefined {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>(BACK_LINKS)).find(
    (link) => link.getClientRects().length > 0,
  );
}
