<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { tabsLook } from "./looks.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: TabsPrimitive.TriggerProps = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const look = $derived(tabsLook(platform, width.current));
</script>

<TabsPrimitive.Trigger
  bind:ref
  data-slot="tabs-trigger"
  class={cn(look.trigger, className)}
  {...restProps}
/>
