import type {
  IpcError,
  LibraryListing,
  LibraryTabId,
} from "#lib/ipc/bindings.ts";

import { TabPage } from "./tab-page.svelte.ts";
import { tabKey } from "./library-tabs.ts";
import { TabScroll } from "./tab-scroll.ts";

export interface Showing {
  readonly basis: LibraryListing;
  readonly tabs: readonly LibraryTabId[];
  readonly chosen: LibraryTabId;
  readonly reach: number;
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
  readonly scroll = new TabScroll();
  held = $state.raw<readonly HeldPage[]>([]);
  readonly #idle: TabPage;
  #basis: LibraryListing | undefined;
  #chosen: string | undefined;

  constructor(
    private readonly listedBy: () => LibraryListing,
    private readonly onFailure: (error: IpcError) => void,
  ) {
    this.#idle = this.#open({ kind: "all" });
  }

  show({ basis, tabs, chosen, reach }: Showing): void {
    const isNewListing = basis !== this.#basis;
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

  #open(tab: LibraryTabId): TabPage {
    const page: TabPage = new TabPage(tab, this.listedBy, (error) => {
      if (this.#heldFor(this.#chosen) === page) {
        this.onFailure(error);
      }
    });
    return page;
  }
}
