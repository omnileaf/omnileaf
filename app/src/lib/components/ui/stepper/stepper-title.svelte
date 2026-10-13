<script lang="ts" module>
  import type { StepState } from "./stepper.svelte.ts";

  const LOOKS = {
    completed: "font-medium",
    active: "font-bold",
    inactive: "font-medium text-muted",
  } satisfies Record<StepState, string>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { getStepperItem } from "./stepper.svelte.ts";

  let {
    class: className,
    children,
    ...rest
  }: HTMLAttributes<HTMLSpanElement> = $props();

  const item = getStepperItem();
</script>

<span
  data-slot="stepper-title"
  class={cn("text-center text-footnote", LOOKS[item.state], className)}
  {...rest}
>
  {@render children?.()}
</span>
