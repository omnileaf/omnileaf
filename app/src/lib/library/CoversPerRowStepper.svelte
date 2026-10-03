<script lang="ts">
  import { Minus, Plus } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { COVERS_PER_ROW } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";

  import type { ScreenSize } from "./library-view";

  const ICON_SIZE = 18;

  let {
    size,
    count,
    onCount,
    class: className,
  }: {
    size: ScreenSize;
    count: number;
    onCount: (count: number) => void;
    class?: ClassValue;
  } = $props();

  const { fewest, most } = $derived(COVERS_PER_ROW[size]);
  const numbers = $derived(new Intl.NumberFormat(getLocale()));
  const labelId = $props.id();
</script>

<div class={["items-center gap-md large:gap-label", className]}>
  <div class="flex-1">
    <p id={labelId} class="text-body font-semibold large:text-small">
      {m.library_covers_per_row()}
    </p>
    <p class="text-detail text-muted large:text-caption">
      {m.library_covers_per_row_range({
        fewest: numbers.format(fewest),
        most: numbers.format(most),
      })}
    </p>
  </div>
  <div
    role="group"
    aria-labelledby={labelId}
    class="flex items-center rounded-field border border-border large:rounded-control"
  >
    <button
      type="button"
      aria-label={m.library_fewer_covers_per_row()}
      disabled={count <= fewest}
      class="flex items-center justify-center block-touch-target inline-touch-target disabled:opacity-60 large:block-stepper large:inline-stepper"
      onclick={() => {
        onCount(count - 1);
      }}
    >
      <Minus
        size={ICON_SIZE}
        aria-hidden="true"
        class="large:block-lg large:inline-lg"
      />
    </button>
    <output
      class="text-center text-count font-bold min-inline-stepper-value large:text-small large:min-inline-xl"
    >
      {numbers.format(count)}
    </output>
    <button
      type="button"
      aria-label={m.library_more_covers_per_row()}
      disabled={count >= most}
      class="flex items-center justify-center block-touch-target inline-touch-target disabled:opacity-60 large:block-stepper large:inline-stepper"
      onclick={() => {
        onCount(count + 1);
      }}
    >
      <Plus
        size={ICON_SIZE}
        aria-hidden="true"
        class="large:block-lg large:inline-lg"
      />
    </button>
  </div>
</div>
