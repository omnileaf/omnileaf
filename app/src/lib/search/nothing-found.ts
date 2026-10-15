import { m } from "#lib/paraglide/messages.js";

export function nothingFoundTitle(text: string): string {
  return text === ""
    ? m.library_no_matches()
    : m.search_nothing_matches({ text });
}
