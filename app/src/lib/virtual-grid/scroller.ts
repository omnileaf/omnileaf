/** The nearest ancestor that scrolls, or the page itself. */
export function scrollerOf(element: Element): Element {
  for (
    let ancestor = element.parentElement;
    ancestor !== null;
    ancestor = ancestor.parentElement
  ) {
    if (/auto|scroll/u.test(getComputedStyle(ancestor).overflowY)) {
      return ancestor;
    }
  }
  return document.scrollingElement ?? document.documentElement;
}
