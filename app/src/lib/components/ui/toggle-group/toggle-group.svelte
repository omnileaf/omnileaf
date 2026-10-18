<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    value = $bindable(""),
    class: className,
    ...restProps
  }: Omit<
    Extract<ToggleGroupPrimitive.RootProps, { type: "single" }>,
    "type"
  > = $props();
</script>

<ToggleGroupPrimitive.Root
  bind:ref
  bind:value
  type="single"
  data-slot="toggle-group"
  class={cn(
    "isolate flex flex-wrap items-stretch rounded-shadcn-control shadow-raised",
    className,
  )}
  {...restProps}
/>
