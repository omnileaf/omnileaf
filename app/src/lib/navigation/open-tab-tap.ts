export type OpenTabTap = "nothing" | "scrollToTop" | "firstPage";

export interface OpenTabPlace {
  readonly isTurnedOn: boolean;
  readonly isScrolled: boolean;
  readonly isOnFirstPage: boolean;
}

export function openTabTap({
  isTurnedOn,
  isScrolled,
  isOnFirstPage,
}: OpenTabPlace): OpenTabTap {
  if (!isTurnedOn) {
    return "nothing";
  }
  if (!isOnFirstPage) {
    return "firstPage";
  }
  return isScrolled ? "scrollToTop" : "nothing";
}
