const BACK_WITHIN_SCREEN = "omnileaf:back-within-screen";

/** Asks the screen shown whether it takes a back gesture itself, as picking books ends on back rather than leaving; true when it did. */
export function isBackTakenByScreen(): boolean {
  return !window.dispatchEvent(
    new Event(BACK_WITHIN_SCREEN, { cancelable: true }),
  );
}

/** Takes each back gesture asked of the screen while `takes` returns true, which should also do what back does on the screen. */
export function takeBackWithinScreen(takes: () => boolean): () => void {
  const listener = (event: Event): void => {
    if (takes()) {
      event.preventDefault();
    }
  };
  window.addEventListener(BACK_WITHIN_SCREEN, listener);
  return () => {
    window.removeEventListener(BACK_WITHIN_SCREEN, listener);
  };
}
