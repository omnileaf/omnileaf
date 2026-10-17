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
    "-ms-px flex items-center justify-center border border-border bg-background px-md text-small font-medium whitespace-nowrap text-foreground transition-control min-block-pointer-button first:ms-none first:rounded-s-shadcn-control last:rounded-e-shadcn-control hover:bg-hover aria-checked:bg-hover max-expanded:px-toggle-touch max-expanded:text-body max-expanded:min-block-touch-target",
    className,
  )}
  {...restProps}
/>
