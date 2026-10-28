<script lang="ts">
  import { Dialog as DialogPrimitive, type WithoutChild } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    level = 2,
    class: className,
    children,
    ...restProps
  }: WithoutChild<DialogPrimitive.TitleProps> = $props();
</script>

<DialogPrimitive.Title
  bind:ref
  {level}
  class={cn("min-inline-none", className)}
  {...restProps}
>
  {#snippet child({ props })}
    <svelte:element
      this={`h${String(level)}`}
      {...props}
      role={undefined}
      aria-level={undefined}
    >
      {@render children?.()}
    </svelte:element>
  {/snippet}
</DialogPrimitive.Title>
