import { debounce, type Debouncer } from "#lib/debounce.ts";
import { adoptsUrlAfter, type NavigationType } from "#lib/navigation.ts";
import {
  replaceReportsQuery,
  type ReportsNavigation,
} from "#lib/report-navigation.ts";
import {
  filterToQuery,
  queryToFilter,
  type Query,
} from "#lib/reports-query.ts";
import type { ReportFilter } from "#lib/reports.ts";

export const SEARCH_WRITE_DELAY_MS = 150;

const SUPERSEDED_NAVIGATIONS: ReadonlySet<string> = new Set([
  "navigation aborted",
  "navigation cancelled",
]);

export interface FilterSyncDeps {
  readonly readUrl: () => Pick<URLSearchParams, "get">;
  readonly navigation: ReportsNavigation;
  readonly report: (error: unknown) => void;
}

function isSuperseded(error: unknown): boolean {
  return error instanceof Error && SUPERSEDED_NAVIGATIONS.has(error.message);
}

function isTypingInSearch(before: ReportFilter, after: ReportFilter): boolean {
  return (
    after.search !== undefined &&
    before.status === after.status &&
    before.platform === after.platform &&
    before.version === after.version
  );
}

export class FilterSync {
  filter: ReportFilter;

  readonly #deps: FilterSyncDeps;
  readonly #pendingWrite: Debouncer<Query>;

  constructor(deps: FilterSyncDeps) {
    this.#deps = deps;
    this.filter = $state.raw(queryToFilter(deps.readUrl()));
    this.#pendingWrite = debounce((query) => {
      this.#write(query);
    }, SEARCH_WRITE_DELAY_MS);
  }

  readonly change = (next: ReportFilter): void => {
    const query = filterToQuery(next);
    const typing = isTypingInSearch(this.filter, next);
    this.filter = next;
    if (typing) {
      this.#pendingWrite.schedule(query);
    } else {
      this.#pendingWrite.cancel();
      this.#write(query);
    }
  };

  #adoptUrl(): void {
    this.#pendingWrite.cancel();
    this.filter = queryToFilter(this.#deps.readUrl());
  }

  readonly adoptAfterNavigation = (navigation: {
    readonly type: NavigationType;
  }): void => {
    if (adoptsUrlAfter(navigation.type)) {
      this.#adoptUrl();
    }
  };

  readonly dispose = (): void => {
    this.#pendingWrite.cancel();
  };

  #write(query: Query): void {
    replaceReportsQuery(this.#deps.navigation, query).catch(
      (error: unknown) => {
        if (!isSuperseded(error)) {
          this.#deps.report(error);
        }
      },
    );
  }
}
