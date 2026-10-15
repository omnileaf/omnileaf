<script lang="ts">
  import { Minus, Plus } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import {
    NumberField,
    NumberFieldStep,
  } from "#lib/components/ui/number-field/index.ts";
  import { COVERS_PER_ROW } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import type { ScreenSize } from "./library-view";

  const ICON_SIZE = 18;

  const RANGE_LABELS = {
    phone: m.library_covers_per_row_range_phone,
    tablet: m.library_covers_per_row_range_tablet,
    desktop: m.library_covers_per_row_range,
  } satisfies Record<ScreenSize, typeof m.library_covers_per_row_range>;

  let {
    size,
    count,
    drawn,
    mostThatFit,
    onCount,
    class: className,
  }: {
    size: ScreenSize;
    count: number;
    drawn: number | undefined;
    mostThatFit: number | undefined;
    onCount: (count: number) => void;
    class?: ClassValue;
  } = $props();

  const fewest = $derived(COVERS_PER_ROW[size].fewest);
  const most = $derived(
    Math.max(
      fewest,
      Math.min(COVERS_PER_ROW[size].most, mostThatFit ?? Number.MAX_VALUE),
    ),
  );
  const numbers = $derived(new Intl.NumberFormat(getLocale()));
  const coversThatFit = $derived(
    drawn !== undefined && drawn < count ? drawn : undefined,
  );
</script>

<div class={["flex-col", className]}>
  <div class="flex items-center gap-md large:gap-label">
    <div class="flex-1">
      <p class="text-small text-muted">
        {RANGE_LABELS[size]({
          fewest: numbers.format(fewest),
          most: numbers.format(most),
        })}
      </p>
    </div>
    <NumberField bind:value={() => count, onCount} min={fewest} max={most}>
      <div
        role="group"
        aria-label={m.library_covers_per_row_chosen()}
        class="flex items-center rounded-field border border-border large:rounded-small-control"
      >
        <NumberFieldStep
          direction="down"
          label={m.library_fewer_covers_per_row()}
          class="flex items-center justify-center rounded-s-field transition-control block-touch-target inline-touch-target enabled:hover:bg-hover enabled:active:bg-pressed disabled:opacity-60 large:rounded-s-small-control large:block-stepper large:inline-stepper"
        >
          <Minus
            size={ICON_SIZE}
            aria-hidden="true"
            class="large:block-lg large:inline-lg"
          />
        </NumberFieldStep>
        <output
          class="text-center text-count font-bold min-inline-stepper-value large:text-small large:min-inline-xl"
        >
          {numbers.format(count)}
        </output>
        <NumberFieldStep
          direction="up"
          label={m.library_more_covers_per_row()}
          class="flex items-center justify-center rounded-e-field transition-control block-touch-target inline-touch-target enabled:hover:bg-hover enabled:active:bg-pressed disabled:opacity-60 large:rounded-e-small-control large:block-stepper large:inline-stepper"
        >
          <Plus
            size={ICON_SIZE}
            aria-hidden="true"
            class="large:block-lg large:inline-lg"
          />
        </NumberFieldStep>
      </div>
    </NumberField>
  </div>
  <div aria-live="polite">
    {#if coversThatFit !== undefined}
      <p class="mbs-xs text-footnote text-muted large:text-caption">
        {m.library_covers_per_row_fit({ count: coversThatFit })}
      </p>
    {/if}
  </div>
</div>
