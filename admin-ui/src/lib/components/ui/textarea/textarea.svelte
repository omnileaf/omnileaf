<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import { FIELD_LOOK, FOCUS_RING } from "#lib/components/ui/controls.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    ...restProps
  }: WithElementRef<HTMLTextareaAttributes, HTMLTextAreaElement> = $props();
</script>

<textarea
  bind:this={ref}
  bind:value
  data-slot="textarea"
  class={cn(FIELD_LOOK, FOCUS_RING, "py-2.5 min-block-24", className)}
  {...restProps}></textarea>
