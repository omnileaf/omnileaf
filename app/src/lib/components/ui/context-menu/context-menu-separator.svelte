<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: ContextMenuPrimitive.SeparatorProps = $props();
</script>

<ContextMenuPrimitive.Separator
  bind:ref
  class={cn(
    "-mx-menu-pad my-xs border-bs border-menu-edge android:mx-none",
    className,
  )}
  {...restProps}
/>
