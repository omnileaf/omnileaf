<script lang="ts" module>
  import type { StepState } from "./stepper.svelte.ts";

  const LOOKS = {
    completed:
      "bg-accent text-on-accent group-hover:bg-accent-hover group-active:bg-accent-pressed",
    active:
      "bg-accent text-on-accent ring-4 ring-accent-soft motion-safe:animate-step-grow",
    inactive: "bg-step-off text-muted",
  } satisfies Record<StepState, string>;

  const CHECK_SIZE = 16;
</script>

<script lang="ts">
  import { Check } from "@lucide/svelte";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { getStepperItem } from "./stepper.svelte.ts";

  let { class: className, ...rest }: HTMLAttributes<HTMLSpanElement> = $props();

  const item = getStepperItem();
</script>

<span
  data-slot="stepper-indicator"
  class={cn(
    "flex shrink-0 items-center justify-center rounded-full text-footnote font-bold transition-control block-step-circle inline-step-circle",
    LOOKS[item.state],
    className,
  )}
  {...rest}
>
  {#if item.state === "completed"}
    <Check size={CHECK_SIZE} aria-hidden="true" />
  {:else}
    {item.step}
  {/if}
</span>
