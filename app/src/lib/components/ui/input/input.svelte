<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLInputAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithElementRef<HTMLInputAttributes, HTMLInputElement> = $props();
</script>

<input
  bind:this={ref}
  data-slot="input"
  class={cn(
    "flex-1 bg-transparent outline-none min-inline-none placeholder:text-muted",
    className,
  )}
  {...restProps}
/>
