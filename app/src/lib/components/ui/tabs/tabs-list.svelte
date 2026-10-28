<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { tabsLook } from "./looks.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: TabsPrimitive.ListProps = $props();

  const look = tabsLook(currentPlatform());
</script>

<TabsPrimitive.List
  bind:ref
  data-slot="tabs-list"
  class={cn(look.list, className)}
  {...restProps}
/>
