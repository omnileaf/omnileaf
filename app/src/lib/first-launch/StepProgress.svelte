<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  import type { StepNumber } from "./steps";

  let { position }: { position: StepNumber } = $props();

  const text = $derived(
    m.first_launch_progress({ number: position.number, count: position.count }),
  );
  const dots = $derived(
    Array.from({ length: position.count }, (_, index) => index + 1),
  );
</script>

<div
  role="progressbar"
  aria-label={m.first_launch_progress_label()}
  aria-valuemin={1}
  aria-valuemax={position.count}
  aria-valuenow={position.number}
  aria-valuetext={text}
  class="flex flex-1 items-center gap-sm medium:flex-none"
>
  <span class="flex flex-1 justify-center gap-xs medium:flex-none">
    {#each dots as dot (dot)}
      <span
        class={[
          "rounded-full transition-all block-step-dot motion-safe:duration-grow motion-safe:ease-emphasized",
          dot === position.number
            ? "inline-step-dot-current"
            : "inline-step-dot",
          dot <= position.number ? "bg-accent" : "bg-step-off",
        ]}
      ></span>
    {/each}
  </span>
  <span class="text-caption text-muted">{text}</span>
</div>
