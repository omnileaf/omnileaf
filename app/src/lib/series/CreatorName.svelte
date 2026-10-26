<script lang="ts">
  import { resolve } from "$app/paths";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";

  const LINK =
    "rounded-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent touch:touch-target-around";
  const TODAYS_LINK = `${LINK} text-foreground underline decoration-foreground/40 underline-offset-3`;
  const PHONE_LINK = `${LINK} text-native-on-button-plain`;

  let {
    name,
    seriesCount,
    from,
  }: { name: string; seriesCount: number; from: string } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const href = $derived(
    resolve(
      `/(app)/creator/[name]?${new URLSearchParams({ from }).toString()}`,
      { name: encodeURIComponent(name) },
    ),
  );
</script>

{#if seriesCount > 1}
  <a {href} class={isPhone(platform, width.current) ? PHONE_LINK : TODAYS_LINK}>
    {name}
  </a>
{:else}
  <span>{name}</span>
{/if}
