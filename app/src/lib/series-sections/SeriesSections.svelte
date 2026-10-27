<script lang="ts">
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
  } from "#lib/components/ui/tabs/index.ts";
  import type {
    BookSection,
    SeriesBookListing,
    SeriesSection,
  } from "#lib/ipc/bindings.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { sectionTabs, shownSection } from "./section-listing";
  import { tabWords } from "./section-names";

  let {
    sections,
    listing,
    onListing,
    children,
  }: {
    sections: readonly SeriesSection[];
    listing: SeriesBookListing;
    onListing: (listing: SeriesBookListing) => void;
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

  function isTab(value: string): value is BookSection {
    return tabs.some((tab) => tab.section === value);
  }
</script>

{#if tabs.length > 0 && section !== undefined}
  <Tabs
    value={section}
    onValueChange={(chosen: string) => {
      if (isTab(chosen)) {
        onListing({ ...listing, section: chosen });
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
      {@render children()}
    </TabsContent>
  </Tabs>
{:else}
  {@render children()}
{/if}
