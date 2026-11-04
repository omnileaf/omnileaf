<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { copy } from "#lib/copy.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<nav
  bind:this={ref}
  data-slot="breadcrumb"
  aria-label={copy.breadcrumb}
  {...restProps}
>
  {@render children?.()}
</nav>
