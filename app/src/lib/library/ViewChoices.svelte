<script lang="ts">
  import type {
    LibraryDisplay,
    LibraryView,
    OnCovers,
  } from "#lib/ipc/bindings.ts";

  import ContinueRowChoice from "./ContinueRowChoice.svelte";
  import CoversPerRowChoice from "./CoversPerRowChoice.svelte";
  import DisplayChoice from "./DisplayChoice.svelte";
  import ItemCountsChoice from "./ItemCountsChoice.svelte";
  import OnCoversChoice from "./OnCoversChoice.svelte";
  import {
    type ScreenSize,
    withContinueRow,
    withCoversPerRow,
    withDisplay,
    withFitsCoversToWidth,
    withItemCounts,
    withOnCovers,
  } from "./library-view";

  let {
    view,
    coversDrawn,
    mostThatFit,
    onChoose,
  }: {
    view: LibraryView;
    coversDrawn: number | undefined;
    mostThatFit: number | undefined;
    onChoose: (view: LibraryView) => void;
  } = $props();

  const coversInARow = $derived(
    view.display === "list" ? undefined : coversDrawn,
  );
</script>

<DisplayChoice
  chosen={view.display}
  onChoose={(display: LibraryDisplay) => {
    onChoose(withDisplay(view, display));
  }}
/>
{#if view.display !== "list"}
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
{/if}
<ItemCountsChoice
  isShown={view.showsItemCounts}
  onChoose={(isShown: boolean) => {
    onChoose(withItemCounts(view, isShown));
  }}
/>
<ContinueRowChoice
  isShown={view.showsContinueRow}
  onChoose={(isShown: boolean) => {
    onChoose(withContinueRow(view, isShown));
  }}
/>
<OnCoversChoice
  onCovers={view.onCovers}
  onChoose={(name: keyof OnCovers, isShown: boolean) => {
    onChoose(withOnCovers(view, name, isShown));
  }}
/>
