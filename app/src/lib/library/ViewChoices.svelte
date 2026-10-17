<script lang="ts">
  import type {
    LibraryDisplay,
    LibraryGrouping,
    LibraryView,
    OnCovers,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import CoversPerRowChoice from "./CoversPerRowChoice.svelte";
  import DisplayChoice from "./DisplayChoice.svelte";
  import GroupByChoice from "./GroupByChoice.svelte";
  import OnCoversChoice from "./OnCoversChoice.svelte";
  import ViewSwitchRow from "./ViewSwitchRow.svelte";
  import {
    type ScreenSize,
    withContinueRow,
    withCategoryTabs,
    withCoversPerRow,
    withDisplay,
    withFitsCoversToWidth,
    withGroupBy,
    withItemCounts,
    withOnCovers,
  } from "./library-view";

  let {
    view,
    coversDrawn,
    mostThatFit,
    hasCategories,
    onChoose,
  }: {
    view: LibraryView;
    coversDrawn: number | undefined;
    mostThatFit: number | undefined;
    hasCategories: boolean;
    onChoose: (view: LibraryView) => void;
  } = $props();

  const layoutId = $props.id();
  const pageId = `${layoutId}-page`;
  const coversInARow = $derived(
    view.display === "list" ? undefined : coversDrawn,
  );
</script>

<section aria-labelledby={layoutId} class="flex flex-col">
  <h3 id={layoutId} class="text-small font-semibold">
    {m.library_view_layout()}
  </h3>
  <div class="flex flex-col divide-y divide-border">
    <div class="py-setting-grid-pad">
      <DisplayChoice
        chosen={view.display}
        onChoose={(display: LibraryDisplay) => {
          onChoose(withDisplay(view, display));
        }}
      />
    </div>
    {#if view.display !== "list"}
      <div class="py-setting-grid-pad">
        <CoversPerRowChoice
          {view}
          drawn={coversInARow}
          {mostThatFit}
          onFit={(fitsToWidth: boolean) => {
            onChoose(withFitsCoversToWidth(view, fitsToWidth));
          }}
          onCount={(size: ScreenSize, count: number) => {
            onChoose(withCoversPerRow(view, size, count));
          }}
        />
      </div>
    {/if}
    <div class="py-setting-grid-pad">
      <GroupByChoice
        chosen={view.groupBy}
        onChoose={(grouping: LibraryGrouping) => {
          onChoose(withGroupBy(view, grouping));
        }}
      />
    </div>
    {#if hasCategories}
      <ViewSwitchRow
        label={m.library_category_tabs()}
        description={m.library_category_tabs_hint()}
        isOn={view.showsCategoryTabs}
        onToggle={(isShown: boolean) => {
          onChoose(withCategoryTabs(view, isShown));
        }}
      />
    {/if}
  </div>
</section>
<section role="group" aria-labelledby={pageId} class="flex flex-col">
  <h3 id={pageId} class="pbs-xl text-small font-semibold">
    {m.library_on_the_page()}
  </h3>
  <div class="flex flex-col divide-y divide-border">
    <ViewSwitchRow
      label={m.library_item_counts()}
      description={m.library_item_counts_hint()}
      isOn={view.showsItemCounts}
      onToggle={(isShown: boolean) => {
        onChoose(withItemCounts(view, isShown));
      }}
    />
    <ViewSwitchRow
      label={m.library_continue_row()}
      description={m.library_continue_row_hint()}
      isOn={view.showsContinueRow}
      onToggle={(isShown: boolean) => {
        onChoose(withContinueRow(view, isShown));
      }}
    />
  </div>
</section>
<OnCoversChoice
  onCovers={view.onCovers}
  onChoose={(name: keyof OnCovers, isShown: boolean) => {
    onChoose(withOnCovers(view, name, isShown));
  }}
/>
