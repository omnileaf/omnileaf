import {
  FILTER_CONDITIONS,
  type FilterCondition,
} from "#lib/library/library-listing.ts";

const FINISHED_WORD = /(\S+)\s+/gu;

export type FilterWords = Readonly<Record<FilterCondition, string>>;

export interface TypedFilters {
  readonly text: string;
  /** Each condition a filter word named, once, in the order typed. */
  readonly conditions: readonly FilterCondition[];
}

export function takeFilterWords(
  typed: string,
  words: FilterWords,
  locale: string,
): TypedFilters {
  const conditionOf = new Map(
    FILTER_CONDITIONS.map((condition) => [
      words[condition].toLocaleLowerCase(locale),
      condition,
    ]),
  );
  const conditions: FilterCondition[] = [];
  const text = typed.replace(FINISHED_WORD, (finished, word: string) => {
    const condition = conditionOf.get(word.toLocaleLowerCase(locale));
    if (condition === undefined) {
      return finished;
    }
    if (!conditions.includes(condition)) {
      conditions.push(condition);
    }
    return "";
  });
  return { text, conditions };
}
