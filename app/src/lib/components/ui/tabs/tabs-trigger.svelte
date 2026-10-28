<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { tabsLook } from "./looks.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: TabsPrimitive.TriggerProps = $props();

  const look = tabsLook(currentPlatform());
</script>

<TabsPrimitive.Trigger
  bind:ref
  data-slot="tabs-trigger"
  class={cn(look.trigger, className)}
  {...restProps}
/>
