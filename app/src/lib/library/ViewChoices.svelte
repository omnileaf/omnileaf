<script lang="ts">
  import type {
    LibraryDisplay,
    LibraryGrouping,
    LibraryView,
    OnCovers,
  } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { coverTileLook } from "./cover-tile";
  import { ANDROID_FILTER_HEADING } from "./filter-sheet-look";
  import CoversPerRowChoice from "./CoversPerRowChoice.svelte";
  import DisplayChoice from "./DisplayChoice.svelte";
  import GroupByChoice from "./GroupByChoice.svelte";
  import OnCoversChoice from "./OnCoversChoice.svelte";
  import { type GroupLook, PLAIN_GROUP_LOOK } from "./group-look";
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
    withStackedCovers,
  } from "./library-view";

  const isMac = currentPlatform() === "macos";

  let {
    view,
    coversDrawn,
    mostThatFit,
    hasCategories,
    onChoose,
    look = PLAIN_GROUP_LOOK,
  }: {
    view: LibraryView;
    coversDrawn: number | undefined;
    mostThatFit: number | undefined;
    hasCategories: boolean;
    onChoose: (view: LibraryView) => void;
    look?: GroupLook;
  } = $props();

  const width = new WindowWidth();
  const isMaterial = $derived(
    phoneOf(currentPlatform(), width.current) === "android",
  );
  const headingClass = $derived(
    isMaterial ? ANDROID_FILTER_HEADING : look.heading,
  );
  const groupClass = $derived(isMaterial ? "flex flex-col" : look.group);
  const choicesClass = $derived(isMaterial ? "flex flex-col" : look.choices);

  const layoutId = $props.id();
  const pageId = `${layoutId}-page`;
  const canStackCovers = coverTileLook(currentPlatform()).stack !== null;
  const coversInARow = $derived(
    view.display === "list" ? undefined : coversDrawn,
  );
</script>

<section aria-labelledby={layoutId} class={["flex flex-col", look.section]}>
  <h3 id={layoutId} class={headingClass}>
    {m.library_view_layout()}
  </h3>
  <div class={choicesClass}>
    <div class={look.choice}>
      <DisplayChoice
        labelClass={look.itemLabel}
        chosen={view.display}
        onChoose={(display: LibraryDisplay) => {
          onChoose(withDisplay(view, display));
        }}
      />
    </div>
    {#if view.display !== "list"}
      <div class={look.choice}>
        <CoversPerRowChoice
          {view}
          labelClass={look.itemLabel}
          footnoteClass={look.footnote}
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
    <div class={look.choice}>
      <GroupByChoice
        labelClass={look.itemLabel}
        footnoteClass={look.footnote}
        chosen={view.groupBy}
        onChoose={(grouping: LibraryGrouping) => {
          onChoose(withGroupBy(view, grouping));
        }}
      />
    </div>
    {#if hasCategories}
      <ViewSwitchRow
        usesItemRow={isMaterial}
        titleClass={look.rowTitle}
        label={isMac ? m.library_category_sidebar() : m.library_category_tabs()}
        description={isMac
          ? m.library_category_sidebar_hint()
          : m.library_category_tabs_hint()}
        isOn={view.showsCategoryTabs}
        onToggle={(isShown: boolean) => {
          onChoose(withCategoryTabs(view, isShown));
        }}
      />
    {/if}
    {#if canStackCovers}
      <ViewSwitchRow
        usesItemRow={isMaterial}
        titleClass={look.rowTitle}
        label={m.library_stack_covers()}
        description={m.library_stack_covers_hint()}
        isOn={view.stacksSeriesCovers}
        onToggle={(stacks: boolean) => {
          onChoose(withStackedCovers(view, stacks));
        }}
      />
    {/if}
  </div>
</section>
<section
  role="group"
  aria-labelledby={pageId}
  class={["flex flex-col", look.section]}
>
  <h3
    id={pageId}
    class={isMaterial ? ANDROID_FILTER_HEADING : look.pageHeading}
  >
    {m.library_on_the_page()}
  </h3>
  <div class={groupClass}>
    <ViewSwitchRow
      usesItemRow={isMaterial}
      titleClass={look.rowTitle}
      label={m.library_item_counts()}
      description={m.library_item_counts_hint()}
      isOn={view.showsItemCounts}
      onToggle={(isShown: boolean) => {
        onChoose(withItemCounts(view, isShown));
      }}
    />
    <ViewSwitchRow
      usesItemRow={isMaterial}
      titleClass={look.rowTitle}
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
  {look}
  {isMaterial}
  onCovers={view.onCovers}
  onChoose={(name: keyof OnCovers, isShown: boolean) => {
    onChoose(withOnCovers(view, name, isShown));
  }}
/>
