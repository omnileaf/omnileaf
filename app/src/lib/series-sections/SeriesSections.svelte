<script lang="ts">
  import { type Snippet, tick, untrack } from "svelte";

  import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
  } from "#lib/components/ui/tabs/index.ts";
  import type {
    BookSection,
    NumberRange,
    ReadMark,
    SeriesBook,
    SeriesBookListing,
    SeriesSection,
    SortDirection,
  } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import type { ListState } from "#lib/paging/paged-list.svelte.ts";
  import {
    type BooksControls,
    OWN_CONTROLS,
  } from "#lib/series/books-controls.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    hasHeadingOverTabs,
    type ListingChange,
    type SectionView,
    sectionTabs,
    sectionView,
    shownSection,
  } from "./section-listing";
  import BookSearchField from "./BookSearchField.svelte";
  import { sectionCount, tabWords } from "./section-names";
  import SectionHeading from "./SectionHeading.svelte";
  import type { ListedBooks } from "./listed-books";
  import SectionListingChoices from "./SectionListingChoices.svelte";
  import SectionPanel from "./SectionPanel.svelte";
  import { sectionTabsLook } from "./section-tabs-look";
  import SeriesSortSheet from "./SeriesSortSheet.svelte";

  let {
    sections,
    missingVolumes,
    lastVolume,
    listing,
    onListing,
    books,
    usesStandIns,
    onMark,
    onPickedCount,
    children,
  }: {
    sections: readonly SeriesSection[];
    missingVolumes: readonly NumberRange[];
    lastVolume: number | null;
    listing: SeriesBookListing;
    onListing: (change: ListingChange) => void;
    books: ListedBooks | undefined;
    usesStandIns: boolean;
    onMark: (picked: SeriesBook["id"][], read: ReadMark) => Promise<boolean>;
    onPickedCount?: ((count: number | undefined) => void) | undefined;
    children: Snippet<[BooksControls]>;
  } = $props();

  const kinds = $derived(sections.map(({ section }) => section));
  const width = new WindowWidth();
  const screen = $derived({
    platform: currentPlatform(),
    width: width.current,
  });
  const tabsLook = $derived(sectionTabsLook(screen.platform, screen.width));
  const hasHeading = $derived(hasHeadingOverTabs(sections, screen));
  const headingId = $props.id();
  const tabs = $derived(sectionTabs(sections, screen));
  const section = $derived(shownSection(listing, kinds));
  const view = $derived(sectionView(listing, kinds, screen));
  let search = $state("");
  let isFinding = $state(false);
  let isSorting = $state(false);
  let findField = $state<HTMLInputElement | null>(null);
  const chosenTab = $derived(tabs.find((tab) => tab.section === section));
  let staleList = $state<ListState<SeriesBook>>();
  let readFor: string | undefined;

  function readKey(shown: BookSection | undefined, shownView: SectionView) {
    return `${shown ?? "every"}:${shownView}`;
  }

  function readAfresh(change: ListingChange, key: string): void {
    staleList = books?.list;
    readFor = key;
    onListing(change);
  }

  $effect(() => {
    const key = readKey(section, view);
    untrack(() => {
      if (readFor === undefined) {
        readFor = key;
      } else if (key !== readFor) {
        readAfresh({}, key);
      }
    });
  });
  const choices = $derived({
    direction: listing.direction,
    onDirection: (direction: SortDirection) => {
      onListing({ direction });
    },
    search,
    onSearch: (typed: string) => {
      search = typed;
      if (books?.list.kind === "loaded" && !books.list.isComplete) {
        void books.loadAll();
      }
    },
  });
  const booksControls = $derived<BooksControls>(
    hasHeading
      ? { kind: "above", headingId, search, onSearch: choices.onSearch }
      : OWN_CONTROLS,
  );

  $effect(() => {
    if (!hasHeading) {
      closeFinding();
      isSorting = false;
    }
  });
  const panel = $derived({
    section,
    noted: tabs.length > 0 || view === "covers" ? section : undefined,
    view,
    series: { sections: kinds, missingVolumes, lastVolume },
    direction: listing.direction,
    shown: listing.shown,
    search,
    books: books?.list === staleList ? undefined : books,
    usesStandIns,
    onMark,
    onPickedCount,
    children: booksWithControls,
    onClearSearch: () => {
      search = "";
    },
    onShowAll: () => {
      onListing({ shown: "all" });
    },
  });

  function closeFinding(): void {
    isFinding = false;
    search = "";
  }

  async function toggleFinding(): Promise<void> {
    if (isFinding) {
      closeFinding();
      return;
    }
    isFinding = true;
    await tick();
    findField?.focus();
  }

  function isTab(value: string): value is BookSection {
    return tabs.some((tab) => tab.section === value);
  }
</script>

{#snippet booksWithControls()}
  {@render children(booksControls)}
{/snippet}

{#if tabs.length > 0 && section !== undefined}
  <Tabs
    value={section}
    onValueChange={(chosen: string) => {
      if (isTab(chosen)) {
        search = "";
        const chosenView = sectionView(
          { ...listing, section: chosen },
          kinds,
          screen,
        );
        readAfresh({ section: chosen }, readKey(chosen, chosenView));
      }
    }}
    class="flex flex-col gap-lg"
  >
    <div class={tabsLook.row}>
      {#if hasHeading && chosenTab !== undefined}
        <SectionHeading
          id={headingId}
          heading={sectionCount(chosenTab)}
          {isFinding}
          {isSorting}
          onFind={() => {
            void toggleFinding();
          }}
          onSortAndFilter={() => {
            isSorting = true;
          }}
        />
      {:else if tabsLook.controls === "choicesFirst" && view === "covers"}
        <SectionListingChoices {...choices} />
      {/if}
      <TabsList aria-label={m.series_sections()} class={tabsLook.list}>
        {#each tabs as tab (tab.section)}
          {@const words = tabWords(tab)}
          <TabsTrigger
            value={tab.section}
            data-label={words.text}
            aria-label={words.label}
          >
            {words.text}
          </TabsTrigger>
        {/each}
      </TabsList>
      {#if tabsLook.controls === "choicesAfter" && view === "covers"}
        <SectionListingChoices {...choices} />
      {:else if hasHeading && isFinding}
        <BookSearchField
          bind:field={findField}
          search={choices.search}
          onSearch={choices.onSearch}
        />
      {/if}
    </div>
    <TabsContent value={section} class="flex flex-col gap-lg">
      <SectionPanel {...panel} />
    </TabsContent>
  </Tabs>
  {#if hasHeading}
    <SeriesSortSheet
      {listing}
      isOpen={isSorting}
      onChoose={onListing}
      onClose={() => {
        isSorting = false;
      }}
    />
  {/if}
{:else}
  {#if view === "covers"}
    <SectionListingChoices {...choices} />
  {/if}
  <SectionPanel {...panel} />
{/if}
