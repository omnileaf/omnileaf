import { CircleAlert, FolderSearch, TriangleAlert } from "@lucide/svelte";

import type { Glyph } from "#lib/page/glyph.ts";
import { m } from "#lib/paraglide/messages.js";

import type { EmptiedFolder } from "./rescans.svelte";

export interface EmptiedFolderLook {
  readonly role: "status" | "alert";
  readonly icon: Glyph;
  readonly nativeIcon: Glyph;
  readonly title: (inputs: { name: string }) => string;
  readonly body: (inputs: { name: string }) => string;
  readonly remove: () => string;
}

export const EMPTIED_FOLDER_LOOKS = {
  foundEmpty: {
    role: "status",
    icon: FolderSearch,
    nativeIcon: TriangleAlert,
    title: m.library_found_empty_title,
    body: m.library_found_empty_body,
    remove: m.library_remove_books,
  },
  removalFailed: {
    role: "alert",
    icon: CircleAlert,
    nativeIcon: CircleAlert,
    title: m.library_remove_books_failed,
    body: m.library_remove_books_failed_body,
    remove: m.library_remove_books_try_again,
  },
} satisfies Record<EmptiedFolder, EmptiedFolderLook>;
