<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  let {
    isShown,
    onChoose,
  }: { isShown: boolean; onChoose: (isShown: boolean) => void } = $props();

  const hintId = $props.id();
</script>

<label
  class="flex cursor-pointer items-center gap-md border-bs border-border pbs-md min-block-switch-row large:items-start large:gap-label large:min-block-auto"
>
  <input
    type="checkbox"
    aria-describedby={hintId}
    class="peer sr-only large:not-sr-only large:order-first large:mbs-2xs large:shrink-0 large:accent-accent large:block-lg large:inline-lg"
    checked={isShown}
    onchange={(event) => {
      onChoose(event.currentTarget.checked);
    }}
  />
  <span class="flex flex-1 flex-col gap-2xs">
    <span class="text-body font-semibold large:text-small">
      {m.library_item_counts()}
    </span>
    <span
      id={hintId}
      aria-hidden="true"
      class="text-detail text-muted large:text-caption"
    >
      {m.library_item_counts_hint()}
    </span>
  </span>
  <span
    aria-hidden="true"
    class="flex shrink-0 items-center rounded-full bg-switch-off p-switch-inset block-switch-block inline-switch peer-checked:justify-end peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent large:hidden"
  >
    <span
      class="rounded-full bg-switch-knob block-switch-knob inline-switch-knob"
    ></span>
  </span>
</label>
