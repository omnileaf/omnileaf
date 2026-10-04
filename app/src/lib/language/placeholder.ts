const VALUE_MARK = "\u{E000}";

export interface TextAround {
  readonly before: string;
  readonly after: string;
}

/** Splits a whole-sentence message around its one value, so the value can be marked up apart from the words. */
export function textAroundValue(
  format: (value: string) => string,
): TextAround | undefined {
  const [before, after, ...rest] = format(VALUE_MARK).split(VALUE_MARK);
  if (before === undefined || after === undefined || rest.length > 0) {
    return undefined;
  }
  return { before, after };
}
