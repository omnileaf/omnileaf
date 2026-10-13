<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  import SwitchLookCheckbox from "./SwitchLookCheckbox.svelte";

  let {
    isShown,
    onChoose,
  }: { isShown: boolean; onChoose: (isShown: boolean) => void } = $props();

  const headingId = $props.id();
  const hintId = `${headingId}-hint`;
</script>

<div
  role="group"
  aria-labelledby={headingId}
  class="flex flex-col large:gap-2xs large:border-bs large:border-border large:pbs-md"
>
  <p
    id={headingId}
    class="mbe-2xs text-detail font-semibold text-muted large:mbe-xs large:text-caption"
  >
    {m.library_on_the_page()}
  </p>
  <label
    class="flex items-center gap-md min-block-switch-row large:items-start large:gap-label large:min-block-auto"
  >
    <SwitchLookCheckbox
      bind:checked={() => isShown, onChoose}
      aria-describedby={hintId}
      class="large:mbs-2xs"
    />
    <span class="flex flex-1 flex-col gap-2xs">
      <span class="text-body font-semibold large:text-small">
        {m.library_continue_row()}
      </span>
      <span
        id={hintId}
        aria-hidden="true"
        class="text-detail text-muted large:text-caption"
      >
        {m.library_continue_row_hint()}
      </span>
    </span>
  </label>
</div>
