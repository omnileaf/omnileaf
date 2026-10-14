<script lang="ts">
  import type { SeriesCreator } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { nameList, roleName } from "./creator-role.ts";
  import { creditsOf } from "./credits.ts";

  let {
    creators,
    onShowAll,
  }: { creators: readonly SeriesCreator[]; onShowAll: () => void } = $props();

  const credits = $derived(creditsOf(creators));
  const named = $derived.by(() => {
    if (credits === undefined) {
      return undefined;
    }
    if (credits.kind === "by") {
      return m.series_by({ names: nameList(credits.names) });
    }
    return credits.credits
      .map(({ role, name }) => m.series_credit({ role: roleName(role), name }))
      .join(" · ");
  });
</script>

{#if credits !== undefined}
  <p class="text-small text-muted">
    {named}
    {#if credits.more > 0}
      <button
        type="button"
        aria-label={m.series_show_all_creators({ count: creators.length })}
        class="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
        onclick={onShowAll}
      >
        {m.series_more_creators({ count: credits.more })}
      </button>
    {/if}
  </p>
{/if}
