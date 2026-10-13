<script lang="ts">
  import type { HTMLLiAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let { class: className, children, ...restProps }: HTMLLiAttributes = $props();
</script>

<li
  class={cn("inline-flex items-center min-inline-none", className)}
  {...restProps}
>
  {@render children?.()}
</li>
