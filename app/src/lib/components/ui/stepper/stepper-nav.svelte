<script lang="ts">
  import type { HTMLOlAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let { class: className, children, ...rest }: HTMLOlAttributes = $props();
</script>

<ol data-slot="stepper-nav" class={cn("flex", className)} {...rest}>
  {@render children?.()}
</ol>
