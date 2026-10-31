<script lang="ts">
  import { DEFAULT_LIBRARY_VIEW } from "#lib/ipc/bindings.ts";
  import type { LibraryFilterChoices, Platform } from "#lib/ipc/bindings.ts";
  import {
    SidebarSetting,
    setSidebarSetting,
  } from "#lib/navigation/sidebar.svelte.ts";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";

  import FilterAndSort from "./FilterAndSort.svelte";
  import { NEW_LIBRARY_LISTING } from "./library-listing";
  import ViewOptions from "./ViewOptions.svelte";

  const CHOICES: LibraryFilterChoices = {
    formats: [],
    languages: [],
    tags: [],
    ratesAdult: false,
    keepsBookmarks: false,
    smart: [],
  };

  let { platform }: { platform: Platform } = $props();

  setSidebarSetting(new SidebarSetting(undefined));
</script>

<main>
  <CollectionHeading {platform} title="Library" showsLabel={false}>
    {#snippet actions()}
      <FilterAndSort
        listing={NEW_LIBRARY_LISTING}
        choices={CHOICES}
        matching={3}
        docks={true}
        panelId="filters"
        onChoose={() => undefined}
        onOpen={() => undefined}
      />
      <ViewOptions
        view={DEFAULT_LIBRARY_VIEW}
        coversDrawn={undefined}
        mostThatFit={undefined}
        hasCategories={false}
        onChoose={() => undefined}
      />
    {/snippet}
  </CollectionHeading>
</main>
