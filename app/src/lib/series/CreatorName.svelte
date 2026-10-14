<script lang="ts">
  import { resolve } from "$app/paths";

  let {
    name,
    seriesCount,
    from,
  }: { name: string; seriesCount: number; from: string } = $props();

  const href = $derived(
    `${resolve("/(app)/creator/[name]", { name: encodeURIComponent(name) })}?${new URLSearchParams({ from }).toString()}`,
  );
</script>

{#if seriesCount > 1}
  <a
    {href}
    class="rounded-link text-foreground underline decoration-foreground/40 underline-offset-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent touch:touch-target-around"
  >
    {name}
  </a>
{:else}
  <span>{name}</span>
{/if}
