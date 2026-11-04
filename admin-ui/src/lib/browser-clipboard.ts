import type { ClipboardWriter } from "#lib/copy-text.ts";

/** Browsers leave `navigator.clipboard` out of pages that are not in a secure context. */
export function browserClipboard(): ClipboardWriter | undefined {
  return "clipboard" in navigator ? navigator.clipboard : undefined;
}
