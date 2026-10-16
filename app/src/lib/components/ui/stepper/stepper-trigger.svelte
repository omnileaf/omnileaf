<script lang="ts" module>
  import type { StepState } from "./stepper.svelte.ts";

  const LOOKS = {
    completed: "",
    active: "cursor-default",
    inactive: "cursor-default",
  } satisfies Record<StepState, string>;
</script>

<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { getStepperItem } from "./stepper.svelte.ts";

  let { class: className, children, ...rest }: HTMLButtonAttributes = $props();

  const item = getStepperItem();
</script>

<button
  type="button"
  data-slot="stepper-trigger"
  aria-current={item.state === "active" ? "step" : undefined}
  aria-disabled={item.state === "inactive" ? "true" : undefined}
  class={cn(
    "group z-1 flex flex-col items-center gap-xs rounded-control px-xs focus-visible:focus-ring",
    LOOKS[item.state],
    className,
  )}
  onclick={() => {
    item.select();
  }}
  {...rest}
>
  {@render children?.()}
</button>
