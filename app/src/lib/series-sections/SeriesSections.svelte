<script lang="ts">
  import { type Snippet, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

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
  import { EXPANDED_QUERY, WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import type { ListState } from "#lib/paging/paged-list.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    type ListingChange,
    type SectionView,
    sectionTabs,
    sectionView,
    shownSection,
  } from "./section-listing";
  import { tabWords } from "./section-names";
  import type { ListedBooks } from "./listed-books";
  import SectionListingChoices from "./SectionListingChoices.svelte";
  import SectionPanel from "./SectionPanel.svelte";
  import { sectionTabsLook } from "./section-tabs-look";

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
    children: Snippet;
  } = $props();

  const kinds = $derived(sections.map(({ section }) => section));
  const isWide = new MediaQuery(EXPANDED_QUERY);
  const screen = $derived({
    platform: currentPlatform(),
    isWide: isWide.current,
  });
  const width = new WindowWidth();
  const tabsLook = $derived(sectionTabsLook(screen.platform, width.current));
  const tabs = $derived(sectionTabs(sections, screen));
  const section = $derived(shownSection(listing, kinds));
  const view = $derived(sectionView(listing, kinds, screen));
  let search = $state("");
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
  const panel = $derived({
    section,
    noted: tabs.length > 0 || view === "covers" ? section : undefined,
    view,
    series: { sections: kinds, missingVolumes, lastVolume },
    direction: listing.direction,
    search,
    books: books?.list === staleList ? undefined : books,
    usesStandIns,
    onMark,
    onPickedCount,
    children,
  });

  function isTab(value: string): value is BookSection {
    return tabs.some((tab) => tab.section === value);
  }
</script>

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
      {#if view === "covers"}
        <SectionListingChoices {...choices} />
      {/if}
    </div>
    <TabsContent value={section} class="flex flex-col gap-lg">
      <SectionPanel {...panel} />
    </TabsContent>
  </Tabs>
{:else}
  {#if view === "covers"}
    <SectionListingChoices {...choices} />
  {/if}
  <SectionPanel {...panel} />
{/if}
