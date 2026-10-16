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
    "-ms-px flex items-center justify-center border border-border bg-background px-md text-small font-medium whitespace-nowrap text-foreground transition-control min-block-segment-item first:ms-none first:rounded-s-shadcn-control last:rounded-e-shadcn-control hover:bg-hover aria-checked:bg-hover data-disabled:opacity-50 data-disabled:hover:bg-background max-expanded:px-toggle-touch max-expanded:text-body max-expanded:min-block-touch-target ios:ms-none ios:rounded-ios-segment-item ios:border-transparent ios:bg-transparent ios:hover:bg-transparent ios:aria-checked:bg-ios-cell ios:aria-checked:shadow-ios-segment macos:rounded-macos-control windows:rounded-windows-control windows:border-windows-stroke windows:bg-windows-control windows:aria-checked:border-accent windows:aria-checked:bg-accent windows:aria-checked:text-on-accent",
    className,
  )}
  {...restProps}
/>
