<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  import type { StepNumber } from "./steps";

  let { position }: { position: StepNumber } = $props();

  const dots = $derived(
    Array.from({ length: position.count }, (_, index) => index + 1),
  );
  const count = $derived(
    m.first_launch_step_count({
      number: position.number,
      count: position.count,
    }),
  );
</script>

<div
  role="progressbar"
  aria-label={m.first_launch_progress_label()}
  aria-valuemin={1}
  aria-valuemax={position.count}
  aria-valuenow={position.number}
  aria-valuetext={count}
  class="flex flex-1 items-center gap-sm min-inline-none"
>
  <span class="flex flex-1 items-center justify-center gap-icon-gap">
    {#each dots as dot (dot)}
      <span
        class={[
          "rounded-full block-step-dot",
          dot <= position.number ? "bg-accent" : "bg-muted",
          dot === position.number ? "inline-step-dash" : "inline-step-dot",
        ]}
      ></span>
    {/each}
  </span>
  <span
    class="text-end text-caption text-muted tabular-nums min-inline-step-count"
  >
    {count}
  </span>
</div>
