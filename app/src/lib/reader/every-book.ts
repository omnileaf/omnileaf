import {
  commands,
  type OpenedBook,
  type SeriesBook,
} from "#lib/ipc/bindings.ts";

const EVERY_BOOK = { shown: "all", direction: "ascending" } as const;

/** Every book of a series in reading order, asked for page by page; none when a page fails. */
export async function everyBookIn(
  series: OpenedBook["series"],
): Promise<SeriesBook[] | undefined> {
  const books: SeriesBook[] = [];
  let after: Parameters<typeof commands.seriesBooks>[2] = null;
  do {
    const page = await commands.seriesBooks(series, EVERY_BOOK, after);
    if (page.status === "error") {
      return undefined;
    }
    books.push(...page.data.books);
    after = page.data.next;
  } while (after !== null);
  return books;
}
