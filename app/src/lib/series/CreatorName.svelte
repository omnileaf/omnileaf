<script lang="ts">
  import { resolve } from "$app/paths";
  import { creatorRoute } from "#lib/library/creator-route.ts";

  let {
    name,
    seriesCount,
    from,
    linkClass,
  }: {
    name: string;
    seriesCount: number;
    from: string;
    linkClass: string;
  } = $props();

  const href = $derived(
    resolve(
      `/(app)/creator/[name]?${new URLSearchParams({ from }).toString()}`,
      creatorRoute(name),
    ),
  );
</script>

{#if seriesCount > 1}
  <a {href} class={linkClass}>
    {name}
  </a>
{:else}
  <span>{name}</span>
{/if}
