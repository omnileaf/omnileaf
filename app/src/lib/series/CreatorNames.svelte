<script lang="ts">
  import type { SeriesCreator } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import CreatorName from "./CreatorName.svelte";

  const LINK =
    "rounded-link underline underline-offset-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent touch:touch-target-around";
  const TODAYS_LINK = `${LINK} text-foreground decoration-foreground/40`;
  const PHONE_LINK = `${LINK} text-native-on-button-plain`;

  let {
    names,
    creators,
    from,
  }: {
    names: readonly string[];
    creators: readonly SeriesCreator[];
    from: string;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const linkClass = $derived(
    isPhone(platform, width.current) ? PHONE_LINK : TODAYS_LINK,
  );
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
    <CreatorName
      name={part.value}
      seriesCount={countFor(part.value)}
      {from}
      {linkClass}
    />
  {:else}
    {part.value}
  {/if}
{/each}
