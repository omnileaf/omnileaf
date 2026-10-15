<script lang="ts">
  import { Plus } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    commands,
    type LibraryCategory,
    type LibraryTab,
  } from "#lib/ipc/bindings.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";
  import {
    type ArrangedTab,
    arrangedTabs,
    NEW_LIBRARY_TABS,
  } from "#lib/library/library-tabs.ts";
  import LibraryTabsList from "#lib/library/LibraryTabsList.svelte";
  import NewCategoryDialog from "#lib/library/NewCategoryDialog.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  const ICON_SIZE = 16;

  let keptTabs = $state<readonly LibraryTab[]>(NEW_LIBRARY_TABS);
  let categories = $state<readonly LibraryCategory[]>([]);
  let seriesCounts = $state<ReadonlyMap<string, number>>(new Map());
  let keepsLabels = $state(false);
  let isNaming = $state(false);
  const arranged = $derived(arrangedTabs(keptTabs, categories));

  function detailOf(tab: ArrangedTab): string {
    switch (tab.id.kind) {
      case "all":
        return m.library_tabs_all_detail();
      case "newChapters":
        return tab.isHidden
          ? m.library_tabs_built_in_hidden()
          : m.library_tabs_built_in();
      case "category": {
        const count = seriesCounts.get(tab.id.id);
        return count === undefined
          ? m.library_tabs_category()
          : m.library_tabs_category_count({ count });
      }
    }
  }

  async function arrange(next: readonly ArrangedTab[]): Promise<void> {
    keptTabs = next.map(({ id, isHidden }) => ({ id, isHidden }));
    const saved = await commands.setLibraryTabs([...keptTabs]);
    if (saved.status === "error") {
      reportError(saved.error);
    }
  }

  async function loadTabs(): Promise<void> {
    const kept = await commands.libraryTabs();
    if (kept.status === "ok") {
      keptTabs = kept.data;
    }
  }

  async function loadCategories(): Promise<void> {
    const kept = await commands.libraryCategories();
    if (kept.status !== "ok") {
      return;
    }
    categories = kept.data;
    const counted = await Promise.all(
      kept.data.map(async ({ id }) => {
        const count = await commands.categorySeriesCount(
          id,
          NEW_LIBRARY_LISTING.filter,
        );
        return [id, count.status === "ok" ? count.data : undefined] as const;
      }),
    );
    seriesCounts = new Map(
      counted.flatMap(([id, count]) =>
        count === undefined ? [] : [[id, count] as const],
      ),
    );
  }

  async function loadLabelSupport(): Promise<void> {
    const labels = await commands.seriesLabels([]);
    keepsLabels = labels.status === "ok" && labels.data.keepsLabels;
  }

  async function addCategory(name: string): Promise<void> {
    isNaming = false;
    const added = await commands.labelSeries([], {
      categoriesAdded: [],
      categoriesRemoved: [],
      categoriesCreated: [name],
      tagsAdded: [],
      tagsRemoved: [],
    });
    if (added.status === "error") {
      reportError(added.error);
      return;
    }
    await loadCategories();
  }

  onMount(() => {
    void loadTabs();
    void loadCategories();
    void loadLabelSupport();
    return listenForLibraryChanges(() => {
      void loadCategories();
    }, reportError);
  });
</script>

<SectionHeading
  title={m.library_tabs_title()}
  parent={{ route: "/(app)/settings/library", title: m.library_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-sm">
  <p class="text-footnote text-muted">
    <span class="desktop:hidden">{m.library_tabs_intro()}</span>
    <span class="hidden desktop:inline">{m.library_tabs_intro_keys()}</span>
  </p>
  <LibraryTabsList
    tabs={arranged}
    {detailOf}
    onArrange={(next: readonly ArrangedTab[]) => {
      void arrange(next);
    }}
  />
  {#if keepsLabels}
    <div class="mbs-sm flex flex-wrap gap-sm">
      <Button
        type="button"
        look="outline"
        class="flex items-center gap-xs rounded-full px-md font-medium min-block-pointer-button touch:min-block-touch-target"
        onclick={() => {
          isNaming = true;
        }}
      >
        <Plus size={ICON_SIZE} aria-hidden="true" />
        {m.library_tabs_new_category()}
      </Button>
    </div>
  {/if}
</div>
<NewCategoryDialog
  isOpen={isNaming}
  onAdd={(name: string) => {
    void addCategory(name);
  }}
  onClose={() => {
    isNaming = false;
  }}
/>
