<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: TabsPrimitive.ListProps = $props();
</script>

<TabsPrimitive.List
  bind:ref
  class={cn("flex gap-xs rounded-field bg-chip p-xs", className)}
  {...restProps}
/>
