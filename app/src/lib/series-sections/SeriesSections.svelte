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
    SeriesBook,
    SeriesBookListing,
    SeriesSection,
  } from "#lib/ipc/bindings.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
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
  import SectionPanel from "./SectionPanel.svelte";

  let {
    sections,
    missingVolumes,
    lastVolume,
    listing,
    onListing,
    books,
    usesStandIns,
    children,
  }: {
    sections: readonly SeriesSection[];
    missingVolumes: readonly NumberRange[];
    lastVolume: number | null;
    listing: SeriesBookListing;
    onListing: (change: ListingChange) => void;
    books: ListedBooks | undefined;
    usesStandIns: boolean;
    children: Snippet;
  } = $props();

  const kinds = $derived(sections.map(({ section }) => section));
  const isWide = new MediaQuery(EXPANDED_QUERY);
  const screen = $derived({
    platform: currentPlatform(),
    isWide: isWide.current,
  });
  const tabs = $derived(sectionTabs(sections, screen));
  const section = $derived(shownSection(listing, kinds));
  const view = $derived(sectionView(listing, kinds, screen));
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
  const panel = $derived({
    section,
    noted: tabs.length > 0 || view === "covers" ? section : undefined,
    view,
    series: { sections: kinds, missingVolumes, lastVolume },
    direction: listing.direction,
    books: books?.list === staleList ? undefined : books,
    usesStandIns,
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
    <TabsList
      aria-label={m.series_sections()}
      class="flex-wrap max-inline-full"
    >
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
    <TabsContent value={section} class="flex flex-col gap-lg">
      <SectionPanel {...panel} />
    </TabsContent>
  </Tabs>
{:else}
  <SectionPanel {...panel} />
{/if}
