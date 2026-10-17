<script lang="ts">
  import {
    RadioGroup,
    RadioGroupItem,
  } from "#lib/components/ui/radio-group/index.ts";
  import type { AdultTreatment } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { ADULT_TREATMENTS } from "./adult-content";

  let {
    chosen,
    onPointer,
    onChoose,
  }: {
    chosen: AdultTreatment;
    onPointer: boolean;
    onChoose: (treatment: AdultTreatment) => void;
  } = $props();

  const LABELS = {
    show: m.adult_content_show,
    blur: m.adult_content_blur,
    hide: m.adult_content_hide,
  } satisfies Record<AdultTreatment, () => string>;

  const HINTS = $derived({
    show: m.adult_content_show_help(),
    blur: onPointer
      ? m.adult_content_blur_help_desktop()
      : m.adult_content_blur_help(),
    hide: m.adult_content_hide_help(),
  } satisfies Record<AdultTreatment, string>);

  const id = $props.id();
</script>

<section
  aria-labelledby="{id}-title"
  class="flex flex-col gap-sm rounded-card border border-border bg-card p-list-row"
>
  <h2 id="{id}-title" class="font-semibold">{m.adult_content_title()}</h2>
  <RadioGroup
    options={ADULT_TREATMENTS}
    {chosen}
    {onChoose}
    aria-labelledby="{id}-title"
    class="flex flex-col divide-y divide-border"
  >
    {#each ADULT_TREATMENTS as treatment (treatment)}
      {@const isChosen = chosen === treatment}
      <RadioGroupItem
        value={treatment}
        aria-labelledby="{id}-{treatment}-label"
        aria-describedby="{id}-{treatment}"
        class="flex items-start gap-md rounded-control py-sm text-start transition-control inline-full hover:tint-hover focus-visible:outline-offset-2 active:tint-pressed"
      >
        <span
          aria-hidden="true"
          class={[
            "mbs-2xs flex shrink-0 items-center justify-center rounded-full border-2 block-radio inline-radio",
            isChosen ? "border-accent" : "border-muted",
          ]}
        >
          {#if isChosen}
            <span
              class="rounded-full bg-accent block-radio-dot inline-radio-dot"
            ></span>
          {/if}
        </span>
        <span class="flex flex-col gap-2xs">
          <span id="{id}-{treatment}-label" class="font-medium">
            {LABELS[treatment]()}
          </span>
          <span id="{id}-{treatment}" class="text-footnote text-muted">
            {HINTS[treatment]}
          </span>
        </span>
      </RadioGroupItem>
    {/each}
  </RadioGroup>
</section>
