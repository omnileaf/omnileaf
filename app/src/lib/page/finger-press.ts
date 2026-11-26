const PRESSED = "data-pressed";
const PRESSABLE = "button:not(:disabled)";
const RELEASES = ["pointerup", "pointercancel"] as const;

/** Chromium leaves `:active` off a button while a finger rests on it, so the button under a finger is marked pressed by hand. */
export function markFingerPresses(root: Document): () => void {
  const release = (): void => {
    for (const held of root.querySelectorAll(`[${PRESSED}]`)) {
      held.removeAttribute(PRESSED);
    }
  };
  const press = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || !(event.target instanceof Element)) {
      return;
    }
    event.target.closest(PRESSABLE)?.setAttribute(PRESSED, "");
  };
  root.addEventListener("pointerdown", press, true);
  for (const type of RELEASES) {
    root.addEventListener(type, release, true);
  }
  return () => {
    root.removeEventListener("pointerdown", press, true);
    for (const type of RELEASES) {
      root.removeEventListener(type, release, true);
    }
  };
}
