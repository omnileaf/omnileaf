<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { NAME_SEPARATOR } from "./folder-guide.ts";

  let {
    names,
    class: className,
  }: { names: readonly string[]; class?: ClassValue | undefined } = $props();
</script>

<span translate="no" class={["font-mono", className]}>
  {#each names as name, index (name)}
    <span>
      {#if index > 0}
        <span aria-hidden="true" class="ps-sm">{NAME_SEPARATOR}</span>
      {/if}
      <code class="font-mono">{name}</code>
    </span>
  {/each}
</span>
