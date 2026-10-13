<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
  bind:ref
  class={cn(
    "flex flex-auto items-center justify-center rounded-control px-sm text-lead font-medium min-block-segment not-aria-selected:text-muted aria-selected:bg-raised aria-selected:font-semibold aria-selected:shadow-raised",
    className,
  )}
  {...restProps}
/>
