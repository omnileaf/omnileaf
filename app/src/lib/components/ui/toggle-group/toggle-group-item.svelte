<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: ToggleGroupPrimitive.ItemProps = $props();
</script>

<ToggleGroupPrimitive.Item
  bind:ref
  data-slot="toggle-group-item"
  class={cn(
    "room-for-bold-label items-center justify-center rounded-small-control px-md text-detail font-medium whitespace-nowrap text-muted transition-control min-block-segment aria-checked:bg-card aria-checked:font-bold aria-checked:text-foreground aria-checked:shadow-raised",
    className,
  )}
  {...restProps}
/>
