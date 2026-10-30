interface Viewport extends EventTarget {
  readonly height: number;
  readonly offsetTop: number;
}

const KEYBOARD_INSET = "--keyboard-inset";

/** Measures what the on-screen keyboard covers from the visual viewport, since WebKit on iOS keeps the layout viewport, and everything fixed to its bottom, at full height under the keyboard. */
export function followKeyboard(
  viewport: Viewport,
  root: HTMLElement,
): () => void {
  let shown: string | undefined;
  const measure = (): void => {
    const covered = root.clientHeight - viewport.height - viewport.offsetTop;
    const inset = `${String(Math.max(0, covered))}px`;
    if (inset !== shown) {
      shown = inset;
      root.style.setProperty(KEYBOARD_INSET, inset);
    }
  };
  measure();
  viewport.addEventListener("resize", measure);
  viewport.addEventListener("scroll", measure);
  return () => {
    viewport.removeEventListener("resize", measure);
    viewport.removeEventListener("scroll", measure);
    root.style.removeProperty(KEYBOARD_INSET);
  };
}
