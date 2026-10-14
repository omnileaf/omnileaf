import type { OpenedBook } from "#lib/ipc/bindings.ts";
import { hasIdShape } from "#lib/ipc/id-shape.ts";

export type BookId = OpenedBook["id"];

/** The book the reader shows, or why it shows none. */
export type BookShown =
  | { readonly kind: "found"; readonly book: OpenedBook }
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "failed" };

/** Takes an id back from a page address the app made from it. */
function isBookId(text: string): text is BookId {
  return hasIdShape(text);
}

/** The book a page address names, or nothing for text that can't be an id the core gave out. */
export function bookIdIn(text: string): BookId | undefined {
  return isBookId(text) ? text : undefined;
}
