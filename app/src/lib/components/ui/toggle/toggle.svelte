<script lang="ts">
  import { Toggle as TogglePrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    pressed = $bindable(false),
    class: className,
    ...restProps
  }: TogglePrimitive.RootProps = $props();
</script>

<TogglePrimitive.Root
  bind:ref
  bind:pressed
  class={cn(
    "room-for-bold-label shrink-0 items-center justify-center rounded-full border border-border px-md text-detail font-medium whitespace-nowrap block-scope-chip aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-bold",
    className,
  )}
  {...restProps}
/>
