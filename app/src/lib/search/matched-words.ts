export interface TitlePart {
  readonly text: string;
  readonly isMatch: boolean;
}

function matchedSpans(
  title: string,
  words: readonly string[],
  locale: string,
): boolean[] {
  const folded = title.toLocaleLowerCase(locale);
  const marked = Array.from({ length: title.length }, () => false);
  for (const word of words) {
    for (
      let at = folded.indexOf(word);
      at !== -1;
      at = folded.indexOf(word, at + word.length)
    ) {
      marked.fill(true, at, at + word.length);
    }
  }
  return marked;
}

/** Splits a title into the runs a search's words matched and the runs between them. */
export function matchedWords(
  title: string,
  typed: string,
  locale: string,
): TitlePart[] {
  const words = typed
    .toLocaleLowerCase(locale)
    .split(/\s+/u)
    .filter((word) => word !== "");
  const marked = matchedSpans(title, words, locale);
  const parts: TitlePart[] = [];
  let start = 0;
  for (let index = 1; index <= title.length; index += 1) {
    if (index === title.length || marked[index] !== marked[start]) {
      parts.push({
        text: title.slice(start, index),
        isMatch: marked[start] ?? false,
      });
      start = index;
    }
  }
  return parts.length > 0 ? parts : [{ text: title, isMatch: false }];
}
