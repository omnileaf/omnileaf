export function booksMatching<Book extends { readonly title: string }>(
  books: readonly Book[],
  search: string,
  locale: string,
): readonly Book[] {
  const wanted = search.trim().toLocaleLowerCase(locale);
  if (wanted === "") {
    return books;
  }
  return books.filter(({ title }) =>
    title.toLocaleLowerCase(locale).includes(wanted),
  );
}
