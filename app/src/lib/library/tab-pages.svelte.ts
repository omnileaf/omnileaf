import type {
  IpcError,
  LibraryListing,
  LibraryTabId,
} from "#lib/ipc/bindings.ts";

import { type KeptTabPage, TabPage } from "./tab-page.svelte.ts";
import { tabKey } from "./library-tabs.ts";
import { isSameValue } from "./same-value.ts";
import { TabScroll } from "./tab-scroll.ts";

export interface Showing {
  readonly basis: LibraryListing;
  readonly tabs: readonly LibraryTabId[];
  readonly chosen: LibraryTabId;
  readonly reach: number;
}

export interface KeptHeldPage {
  readonly key: string;
  readonly page: KeptTabPage;
}

export interface KeptTabPages {
  readonly basis: LibraryListing;
  readonly chosen: string;
  readonly pages: readonly KeptHeldPage[];
  readonly scroll: ReadonlyMap<string, number>;
}

export interface HeldPage {
  readonly key: string;
  readonly page: TabPage;
}

function withinReach(
  tabs: readonly LibraryTabId[],
  chosen: LibraryTabId,
  reach: number,
): readonly LibraryTabId[] {
  const at = tabs.findIndex((tab) => tabKey(tab) === tabKey(chosen));
  return at === -1
    ? [chosen]
    : tabs.slice(Math.max(0, at - reach), at + reach + 1);
}

export class TabPages {
  readonly scroll: TabScroll;
  held = $state.raw<readonly HeldPage[]>([]);
  readonly #idle: TabPage;
  #basis: LibraryListing | undefined;
  #chosen: string | undefined;

  constructor(
    private readonly listedBy: () => LibraryListing,
    private readonly onFailure: (error: IpcError) => void,
    kept?: KeptTabPages,
  ) {
    this.#idle = this.#open({ kind: "all" });
    this.scroll = new TabScroll(kept?.scroll);
    if (kept !== undefined) {
      this.#basis = kept.basis;
      this.#chosen = kept.chosen;
      this.held = kept.pages.map(({ key, page }) => ({
        key,
        page: this.#open(page.tab, page),
      }));
    }
  }

  keep(shownOf: (key: string) => number): KeptTabPages | undefined {
    if (this.#basis === undefined || this.#chosen === undefined) {
      return undefined;
    }
    return {
      basis: this.#basis,
      chosen: this.#chosen,
      pages: this.held.flatMap(({ key, page }) => {
        const kept = page.kept(shownOf(key));
        return kept === undefined ? [] : [{ key, page: kept }];
      }),
      scroll: this.scroll.kept(),
    };
  }

  readHeldAgain(): void {
    for (const { page } of this.held) {
      void page.series.load();
      if (page.count.count !== undefined) {
        void page.count.refresh();
      }
    }
  }

  show({ basis, tabs, chosen, reach }: Showing): void {
    const isNewListing =
      this.#basis === undefined || !isSameValue(basis, this.#basis);
    if (isNewListing) {
      this.scroll.forgetAll();
    }
    const chosenKey = tabKey(chosen);
    const wanted = withinReach(tabs, chosen, reach).map((tab) => ({
      tab,
      key: tabKey(tab),
    }));
    const leaving = this.#heldFor(this.#chosen);
    const lendsLeavingPage =
      isNewListing || !wanted.some(({ key }) => key === this.#chosen);
    this.#basis = basis;
    this.#chosen = chosenKey;
    this.held = wanted.map(({ tab, key }) => {
      const kept = isNewListing ? undefined : this.#heldFor(key);
      if (kept !== undefined) {
        return { key, page: kept };
      }
      const isChosen = key === chosenKey;
      const lent = isChosen && lendsLeavingPage ? leaving : undefined;
      return { key, page: this.#started(tab, lent, isChosen) };
    });
  }

  of(tab: LibraryTabId): TabPage {
    return this.#heldFor(tabKey(tab)) ?? this.#idle;
  }

  refreshBeside(): void {
    for (const { key, page } of this.held) {
      if (key !== this.#chosen) {
        void page.series.load();
        void page.count.load();
      }
    }
  }

  #heldFor(key: string | undefined): TabPage | undefined {
    return this.held.find((held) => held.key === key)?.page;
  }

  #started(
    tab: LibraryTabId,
    lent: TabPage | undefined,
    isChosen: boolean,
  ): TabPage {
    const page = lent?.showing(tab) ?? this.#open(tab);
    void page.series.start();
    if (!isChosen) {
      void page.count.load();
    }
    return page;
  }

  #open(tab: LibraryTabId, kept?: KeptTabPage): TabPage {
    const page: TabPage = new TabPage(
      tab,
      {
        listedBy: this.listedBy,
        onFailure: (error) => {
          if (this.#heldFor(this.#chosen) === page) {
            this.onFailure(error);
          }
        },
      },
      kept,
    );
    return page;
  }
}
