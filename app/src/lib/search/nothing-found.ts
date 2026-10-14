import { m } from "#lib/paraglide/messages.js";

/** What a search that found nothing says, naming the text when there was any beside its filters. */
export function nothingFoundTitle(text: string): string {
  return text === ""
    ? m.library_no_matches()
    : m.search_nothing_called({ text });
}
