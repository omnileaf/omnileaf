<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLTextareaAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

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
  class={cn(
    "block field-sizing-content resize-none rounded-shadcn-control border border-field bg-transparent px-md py-sm text-label text-foreground inline-full min-block-textarea min-inline-none placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger ios:rounded-ios-cell touch:text-body",
    className,
  )}
  {...restProps}></textarea>
