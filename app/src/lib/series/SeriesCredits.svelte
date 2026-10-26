<script lang="ts">
  import type { SeriesCreator } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { roleName } from "./creator-role.ts";
  import CreatorNames from "./CreatorNames.svelte";
  import { creditsOf } from "./credits.ts";

  const SLOT = "\u0000";
  const SEPARATOR = " · ";

  let {
    creators,
    from,
    onShowAll,
  }: {
    creators: readonly SeriesCreator[];
    from: string;
    onShowAll: () => void;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const credits = $derived(creditsOf(creators));
  const lines = $derived.by(() => {
    if (credits === undefined) {
      return [];
    }
    if (credits.kind === "by") {
      const [before = "", after = ""] = m
        .series_by({ names: SLOT })
        .split(SLOT);
      return [{ before, names: credits.names, after }];
    }
    return credits.credits.map(({ role, name }, index) => {
      const [before = "", after = ""] = m
        .series_credit({ role: roleName(role), name: SLOT })
        .split(SLOT);
      return {
        before: index === 0 ? before : `${SEPARATOR}${before}`,
        names: [name],
        after,
      };
    });
  });
</script>

{#if credits !== undefined}
  <p class="text-small text-muted">
    {#each lines as { before, names, after }, index (index)}
      {before}<CreatorNames {names} {creators} {from} />{after}
    {/each}
    {#if credits.more > 0}
      <button
        type="button"
        aria-label={m.series_show_all_creators({
          more: m.series_more_creators({ count: credits.more }),
          count: creators.length,
        })}
        class={[
          "font-medium underline-offset-4 hover:underline focus-visible:underline touch:touch-target-around",
          isPhone(platform, width.current)
            ? "text-native-on-button-plain"
            : "text-foreground",
        ]}
        onclick={onShowAll}
      >
        {m.series_more_creators({ count: credits.more })}
      </button>
    {/if}
  </p>
{/if}
