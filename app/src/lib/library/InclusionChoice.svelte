<script lang="ts">
  import {
    RadioGroup,
    RadioGroupItem,
  } from "#lib/components/ui/radio-group/index.ts";
  import type { Inclusion } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { INCLUSIONS } from "./library-listing";

  const LABELS = {
    any: m.library_filter_any,
    only: m.library_filter_only,
    hide: m.library_filter_hide,
  } satisfies Record<Inclusion, () => string>;

  let {
    label,
    hint,
    chosen,
    onChoose,
  }: {
    label: string;
    hint?: string | undefined;
    chosen: Inclusion;
    onChoose: (inclusion: Inclusion) => void;
  } = $props();

  const id = $props.id();
</script>

<div
  class="flex items-center gap-md border-be border-chip min-block-filter-row medium:gap-label medium:min-block-filter-row-wide"
>
  <div class="flex flex-1 flex-col gap-2xs min-inline-none">
    <span id={`${id}-label`} class="text-body font-semibold medium:text-small">
      {label}
    </span>
    {#if hint !== undefined}
      <span class="text-caption text-muted medium:hidden">{hint}</span>
    {/if}
  </div>
  <RadioGroup
    options={INCLUSIONS}
    {chosen}
    {onChoose}
    orientation="horizontal"
    aria-labelledby={`${id}-label`}
    class="flex shrink-0 gap-2xs rounded-inclusion bg-chip p-inclusion-inset medium:rounded-inclusion-option medium:p-2xs"
  >
    {#each INCLUSIONS as inclusion (inclusion)}
      <RadioGroupItem
        value={inclusion}
        class={[
          "relative flex flex-auto items-center justify-center rounded-inclusion-option px-sm text-detail block-inclusion min-inline-inclusion-option before:absolute before:inset-x-none before:-inset-y-sm medium:rounded-inclusion-option-wide medium:px-icon-gap medium:text-caption medium:block-inclusion-wide medium:min-inline-inclusion-option-wide medium:before:-inset-y-2xs",
          chosen === inclusion
            ? "bg-raised font-semibold shadow-raised"
            : "font-medium text-foreground",
        ]}
      >
        <span
          data-label={LABELS[inclusion]()}
          class="room-for-bold-label items-center"
        >
          {LABELS[inclusion]()}
        </span>
      </RadioGroupItem>
    {/each}
  </RadioGroup>
</div>
