<script lang="ts">
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { stepProgressLook } from "./step-progress-look.ts";
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
  const look = stepProgressLook(currentPlatform());
</script>

<div
  role="progressbar"
  aria-label={m.first_launch_progress_label()}
  aria-valuemin={1}
  aria-valuemax={position.count}
  aria-valuenow={position.number}
  aria-valuetext={count}
  class={["flex items-center min-inline-none", look.root]}
>
  {#if look.isBar}
    <span class={["relative block", look.track]}>
      <span class={["absolute inset-x-none rounded-full bg-border", look.rule]}
      ></span>
      <span
        data-fill
        class={["absolute inset-y-none inset-s-none rounded-full", look.fill]}
        style:inline-size="{share}%"
      ></span>
    </span>
    <span class={["text-muted tabular-nums", look.count]}>{count}</span>
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
