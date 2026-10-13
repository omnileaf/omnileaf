<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { getStepperItem } from "./stepper.svelte.ts";

  let { class: className, ...rest }: HTMLAttributes<HTMLSpanElement> = $props();

  const item = getStepperItem();

  const LINE = "absolute block-step-line";
</script>

{#if !item.isFirst}
  <span
    data-slot="stepper-separator"
    aria-hidden="true"
    class={cn(
      LINE,
      "stepper-line-in",
      item.state === "inactive" ? "bg-step-off" : "bg-accent",
      className,
    )}
    {...rest}
  ></span>
{/if}
{#if !item.isLast}
  <span
    data-slot="stepper-separator"
    aria-hidden="true"
    class={cn(
      LINE,
      "stepper-line-out",
      item.state === "completed" ? "bg-accent" : "bg-step-off",
      className,
    )}
    {...rest}
  ></span>
{/if}
