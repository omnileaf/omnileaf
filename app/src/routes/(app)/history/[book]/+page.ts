import { error } from "@sveltejs/kit";

import { bookIdIn } from "#lib/reader/opened-book.ts";

import type { PageLoad } from "./$types";

const NOT_FOUND = 404;

export const load: PageLoad = ({ params }) => {
  const book = bookIdIn(params.book);
  if (book === undefined) {
    error(NOT_FOUND, "no such book");
  }
  return { book };
};
