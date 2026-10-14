<script lang="ts">
  import {
    RadioGroup as RadioGroupPrimitive,
    type WithoutChild,
  } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChild<RadioGroupPrimitive.ItemProps> = $props();
</script>

<RadioGroupPrimitive.Item
  bind:ref
  class={cn("focus-visible:outline-2 focus-visible:outline-accent", className)}
  {...restProps}
/>
