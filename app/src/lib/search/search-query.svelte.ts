import type { LibraryFilter, LibrarySearch } from "#lib/ipc/bindings.ts";
import type { FilterCondition } from "#lib/library/library-listing.ts";

import { type FilterWords, takeFilterWords } from "./typed-filters";

/** What someone has typed into a search and the conditions they've chosen or typed. */
export class SearchQuery {
  text = $state("");
  conditions: readonly FilterCondition[] = $state([]);

  constructor(
    private readonly words: FilterWords,
    private readonly locale: string,
  ) {}

  /** Nothing to search for: no text but white space, and no condition. */
  get isEmpty(): boolean {
    return this.text.trim() === "" && this.conditions.length === 0;
  }

  get search(): LibrarySearch {
    return { text: this.text.trim(), filter: this.#filter() };
  }

  /** Takes in the field's text, turning each filter word finished with a space into a condition. */
  type(typed: string): void {
    const taken = takeFilterWords(typed, this.words, this.locale);
    this.text = taken.text;
    this.conditions = [
      ...this.conditions,
      ...taken.conditions.filter(
        (condition) => !this.conditions.includes(condition),
      ),
    ];
  }

  /** Starts a search afresh from typed text, with no condition but those its filter words name. */
  startOver(typed: string): void {
    this.conditions = [];
    this.type(typed);
  }

  toggle(condition: FilterCondition): void {
    this.conditions = this.conditions.includes(condition)
      ? this.conditions.filter((chosen) => chosen !== condition)
      : [...this.conditions, condition];
  }

  clearConditions(): void {
    this.conditions = [];
  }

  #filter(): LibraryFilter {
    const inclusion = (condition: FilterCondition) =>
      this.conditions.includes(condition) ? "only" : "any";
    return {
      unread: inclusion("unread"),
      started: inclusion("started"),
      finished: inclusion("finished"),
    };
  }
}
