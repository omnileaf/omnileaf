import type { OpenedBook } from "#lib/ipc/bindings.ts";
import { hasIdShape } from "#lib/ipc/id-shape.ts";

export type BookId = OpenedBook["id"];

export type BookShown =
  | { readonly kind: "found"; readonly book: OpenedBook }
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "failed" };

function isBookId(text: string): text is BookId {
  return hasIdShape(text);
}

export function bookIdIn(text: string): BookId | undefined {
  return isBookId(text) ? text : undefined;
}
