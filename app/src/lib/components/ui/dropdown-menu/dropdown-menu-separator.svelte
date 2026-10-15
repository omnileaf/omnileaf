<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DropdownMenuPrimitive.SeparatorProps = $props();
</script>

<DropdownMenuPrimitive.Separator
  bind:ref
  class={cn("-mx-xs my-xs border-bs border-menu-edge", className)}
  {...restProps}
/>
