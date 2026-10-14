<script lang="ts">
  import type {
    LibraryDisplay,
    LibraryView,
    OnCovers,
  } from "#lib/ipc/bindings.ts";

  import CoversPerRowStepper from "./CoversPerRowStepper.svelte";
  import DisplayChoice from "./DisplayChoice.svelte";
  import ItemCountsChoice from "./ItemCountsChoice.svelte";
  import OnCoversChoice from "./OnCoversChoice.svelte";
  import {
    SCREEN_SIZES,
    type ScreenSize,
    withCoversPerRow,
    withDisplay,
    withItemCounts,
    withOnCovers,
  } from "./library-view";

  const STEPPERS = {
    phone: "flex medium:hidden",
    tablet: "hidden medium:flex large:hidden",
    desktop: "hidden large:flex",
  } satisfies Record<ScreenSize, string>;

  let {
    view,
    coversDrawn,
    onChoose,
  }: {
    view: LibraryView;
    coversDrawn: number | undefined;
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
{#each SCREEN_SIZES as size (size)}
  <CoversPerRowStepper
    {size}
    count={view.coversPerRow[size]}
    drawn={coversInARow}
    class={STEPPERS[size]}
    onCount={(count: number) => {
      onChoose(withCoversPerRow(view, size, count));
    }}
  />
{/each}
<ItemCountsChoice
  isShown={view.showsItemCounts}
  onChoose={(isShown: boolean) => {
    onChoose(withItemCounts(view, isShown));
  }}
/>
<OnCoversChoice
  onCovers={view.onCovers}
  onChoose={(name: keyof OnCovers, isShown: boolean) => {
    onChoose(withOnCovers(view, name, isShown));
  }}
/>
