<script lang="ts">
  import { Dialog as DialogPrimitive, type WithoutChild } from "bits-ui";

  let {
    ref = $bindable(null),
    level = 2,
    children,
    ...restProps
  }: WithoutChild<DialogPrimitive.TitleProps> = $props();
</script>

<DialogPrimitive.Title bind:ref {level} {...restProps}>
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
