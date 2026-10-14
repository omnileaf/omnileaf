<script lang="ts">
  import type { SeriesCreator } from "#lib/ipc/bindings.ts";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import CreatorName from "./CreatorName.svelte";

  let {
    names,
    creators,
    from,
  }: {
    names: readonly string[];
    creators: readonly SeriesCreator[];
    from: string;
  } = $props();

  const parts = $derived(
    new Intl.ListFormat(getLocale(), { type: "unit", style: "short" })
      .formatToParts(names)
      .map((part, index) => ({ ...part, index })),
  );

  function countFor(name: string): number {
    return creators.find((creator) => creator.name === name)?.seriesCount ?? 0;
  }
</script>

{#each parts as part (part.index)}
  {#if part.type === "element"}
    <CreatorName name={part.value} seriesCount={countFor(part.value)} {from} />
  {:else}
    {part.value}
  {/if}
{/each}
