<script lang="ts">
  import type { LibraryView } from "#lib/ipc/bindings.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import CoversPerRowStepper from "./CoversPerRowStepper.svelte";
  import { SCREEN_SIZES, type ScreenSize } from "./library-view";

  type Choice = "auto" | "choose";

  const CHOICES: readonly Choice[] = ["auto", "choose"];
  const LABELS = {
    auto: m.library_covers_per_row_auto,
    choose: m.library_covers_per_row_choose,
  } satisfies Record<Choice, () => string>;
  const STEPPERS = {
    phone: "flex medium:hidden",
    tablet: "hidden medium:flex large:hidden",
    desktop: "hidden large:flex",
  } satisfies Record<ScreenSize, string>;

  let {
    view,
    drawn,
    mostThatFit,
    onFit,
    onCount,
  }: {
    view: LibraryView;
    drawn: number | undefined;
    mostThatFit: number | undefined;
    onFit: (fitsToWidth: boolean) => void;
    onCount: (size: ScreenSize, count: number) => void;
  } = $props();

  const labelId = $props.id();
  const numbers = $derived(new Intl.NumberFormat(getLocale()));
</script>

<div class="flex flex-col gap-sm">
  <div class="flex items-center justify-between gap-md">
    <p id={labelId} class="text-body font-semibold large:text-small">
      {m.library_covers_per_row()}
    </p>
    <SegmentedControl
      options={CHOICES}
      labels={LABELS}
      chosen={view.fitsCoversToWidth ? "auto" : "choose"}
      labelledBy={labelId}
      size="small"
      onChoose={(choice: Choice) => {
        onFit(choice === "auto");
      }}
    />
  </div>
  {#if view.fitsCoversToWidth}
    {#if drawn !== undefined}
      <p class="text-small text-muted">
        {m.library_covers_fit_width({ count: numbers.format(drawn) })}
      </p>
    {/if}
  {:else}
    {#each SCREEN_SIZES as size (size)}
      <CoversPerRowStepper
        {size}
        count={view.coversPerRow[size]}
        {drawn}
        {mostThatFit}
        class={STEPPERS[size]}
        onCount={(count: number) => {
          onCount(size, count);
        }}
      />
    {/each}
  {/if}
</div>
