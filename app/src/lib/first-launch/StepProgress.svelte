<script lang="ts">
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { usesSetupPages } from "./setup-pages.ts";
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
  const share = $derived((100 * position.number) / position.count);
  const isBar = usesSetupPages(currentPlatform());
</script>

<div
  role="progressbar"
  aria-label={m.first_launch_progress_label()}
  aria-valuemin={1}
  aria-valuemax={position.count}
  aria-valuenow={position.number}
  aria-valuetext={count}
  class={[
    "flex items-center min-inline-none",
    isBar ? "gap-md" : "flex-1 gap-sm",
  ]}
>
  {#if isBar}
    <span class="relative block block-setup-bar-height inline-setup-bar">
      <span
        class="absolute inset-x-none inset-bs-px rounded-full bg-border block-px"
      ></span>
      <span
        data-fill
        class="absolute inset-y-none inset-s-none rounded-full bg-windows-accent"
        style:inline-size="{share}%"
      ></span>
    </span>
    <span class="text-caption text-muted tabular-nums">{count}</span>
  {:else}
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
  {/if}
</div>
