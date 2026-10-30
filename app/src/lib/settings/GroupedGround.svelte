<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { GROUPED_GROUND } from "#lib/page/plates.ts";

  let {
    class: className,
    children,
  }: { class?: ClassValue; children: Snippet } = $props();
</script>

<div data-ground="grouped" class={[GROUPED_GROUND, className]}>
  {@render children()}
</div>
