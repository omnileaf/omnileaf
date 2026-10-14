const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether text has the shape of an id the core gives out, leaving the core to refuse one it never gave out. */
export function hasIdShape(text: string): boolean {
  return UUID.test(text);
}
