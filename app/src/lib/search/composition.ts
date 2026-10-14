const COMPOSING_KEY_CODE = 229;

/** Whether a key belongs to an input method's composition, which some engines mark only by the 229 key code. */
export function isComposing(event: KeyboardEvent): boolean {
  return (
    event.isComposing ||
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Safari marks the key ending a composition only by this code
    event.keyCode === COMPOSING_KEY_CODE
  );
}
