import type {
  LibraryFilter,
  LibrarySearch,
  SeriesFormat,
} from "#lib/ipc/bindings.ts";
import {
  type FilterCondition,
  NEW_LIBRARY_LISTING,
} from "#lib/library/library-listing.ts";

import { type FilterWords, takeFilterWords } from "./typed-filters";

export const SEARCH_SCOPES = [
  "everything",
  "manga",
  "book",
] as const satisfies readonly (SeriesFormat | "everything")[];

export type SearchScope = (typeof SEARCH_SCOPES)[number];

export class SearchQuery {
  text = $state("");
  conditions: readonly FilterCondition[] = $state([]);
  scope: SearchScope = $state("everything");

  constructor(
    private readonly words: FilterWords,
    private readonly locale: string,
  ) {}

  get isEmpty(): boolean {
    return this.text.trim() === "" && this.conditions.length === 0;
  }

  get search(): LibrarySearch {
    return { text: this.text.trim(), filter: this.#filter() };
  }

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

  startOver(typed: string): void {
    this.conditions = [];
    this.type(typed);
  }

  toggle(condition: FilterCondition): void {
    this.conditions = this.conditions.includes(condition)
      ? this.conditions.filter((chosen) => chosen !== condition)
      : [...this.conditions, condition];
  }

  narrowTo(scope: SearchScope): void {
    this.scope = scope;
  }

  #filter(): LibraryFilter {
    const inclusion = (condition: FilterCondition) =>
      this.conditions.includes(condition) ? "only" : "any";
    return {
      ...NEW_LIBRARY_LISTING.filter,
      unread: inclusion("unread"),
      started: inclusion("started"),
      finished: inclusion("finished"),
      formats: this.scope === "everything" ? [] : [this.scope],
    };
  }
}
