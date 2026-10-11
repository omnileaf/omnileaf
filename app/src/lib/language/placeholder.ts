const VALUE_MARK = "\u{E000}";

export interface TextAround {
  readonly before: string;
  readonly after: string;
}

export function textAroundValue(
  format: (value: string) => string,
): TextAround | undefined {
  const [before, after, ...rest] = format(VALUE_MARK).split(VALUE_MARK);
  if (before === undefined || after === undefined || rest.length > 0) {
    return undefined;
  }
  return { before, after };
}
