import { createContext } from "svelte";

import type {
  AdultContent,
  LibraryCategory,
  LibraryFilterChoices,
  LibraryFolder,
  LibraryListing,
  LibraryTab,
  LibraryView,
  LibraryWriter,
  MissingFolder,
} from "#lib/ipc/bindings.ts";

import type { KeptHistory } from "#lib/history/history-list.svelte.ts";
import { shownListing } from "#lib/screenshot-mode/shown-listing.ts";

import type { KeptSeries } from "./library-series.svelte.ts";
import { type ArrangedTab, arrangedTabs } from "./library-tabs.ts";
import { isSameValue } from "./same-value.ts";
import type { KeptTabPages } from "./tab-pages.svelte.ts";
import type { KeptCounts } from "./unfiltered-counts.svelte.ts";

export interface KeptGroup {
  readonly series: KeptSeries;
  readonly count: number | undefined;
}

export interface KeptGroupOf {
  readonly key: string;
  readonly group: KeptGroup;
}

export interface LibraryScreen {
  readonly listing: LibraryListing;
  readonly view: LibraryView;
  readonly adultContent: AdultContent;
  readonly categories: readonly LibraryCategory[];
  readonly tabs: readonly LibraryTab[];
  readonly filterChoices: LibraryFilterChoices;
  readonly folders: readonly LibraryFolder[];
  readonly writers: readonly LibraryWriter[];
  readonly missingFolders: readonly MissingFolder[];
  readonly hiddenSeries: number;
  readonly keepsLabels: boolean;
  readonly keepsDetailEdits: boolean;
  readonly pages: KeptTabPages;
  readonly unfilteredCounts: KeptCounts;
  readonly groups: readonly KeptGroupOf[];
  readonly continueRow: KeptHistory | undefined;
}

export type KeepGroup = () => KeptGroup | undefined;

export class LibraryReturn {
  #screen: LibraryScreen | undefined;
  #wasLeft = false;

  get wasLeft(): boolean {
    return this.#wasLeft;
  }

  forgetUnlessTabsAre(tabs: readonly ArrangedTab[]): void {
    const screen = this.#screen;
    if (
      screen !== undefined &&
      !isSameValue(arrangedTabs(screen.tabs, screen.categories), tabs)
    ) {
      this.forget();
    }
  }

  screenFor(usesStandIns: boolean): LibraryScreen | undefined {
    const screen = this.#screen;
    return screen !== undefined &&
      isSameValue(
        shownListing(screen.listing, usesStandIns),
        screen.pages.basis,
      )
      ? screen
      : undefined;
  }

  keep(screen: LibraryScreen | undefined): void {
    this.#wasLeft = true;
    this.#screen = screen;
  }

  forget(): void {
    this.#screen = undefined;
  }

  forgetting<Asked extends unknown[], Answer>(
    change: (...asked: Asked) => Answer,
  ): (...asked: Asked) => Answer {
    return (...asked) => {
      this.forget();
      return change(...asked);
    };
  }
}

export class GroupKeepers {
  readonly #keepers = new Map<string, KeepGroup>();

  add(key: string, keep: KeepGroup): () => void {
    this.#keepers.set(key, keep);
    return () => {
      if (this.#keepers.get(key) === keep) {
        this.#keepers.delete(key);
      }
    };
  }

  kept(): readonly KeptGroupOf[] {
    return [...this.#keepers].flatMap(([key, keep]) => {
      const group = keep();
      return group === undefined ? [] : [{ key, group }];
    });
  }
}

export const [getLibraryReturn, setLibraryReturn] =
  createContext<LibraryReturn>();
