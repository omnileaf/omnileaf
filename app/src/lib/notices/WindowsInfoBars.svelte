<script lang="ts">
  import { Portal } from "bits-ui";
  import { getAllContexts } from "svelte";
  import type { Attachment } from "svelte/attachments";

  import { m } from "#lib/paraglide/messages.js";
  import { shortcut } from "#lib/shortcut.ts";

  import type { NoticeRegion } from "./notice-region.svelte";
  import type { Notices, Politeness, ShownNotice } from "./notices";
  import { pageNoticeSlot } from "./page-notice-slot.svelte";

  const SHOWN_AT_ONCE = 3;
  const JUMP_KEY = "F6";
  const POLITENESS_ORDER = [
    "assertive",
    "polite",
  ] as const satisfies readonly Politeness[];

  let { notices, region }: { notices: Notices; region: NoticeRegion } =
    $props();

  const context = getAllContexts<Map<unknown, unknown>>();
  const slot = $derived(pageNoticeSlot.element);
  const visibleIds = $derived(
    new Set(notices.onScreen.slice(0, SHOWN_AT_ONCE).map(({ id }) => id)),
  );

  function barsAnnounced(politeness: Politeness): ShownNotice[] {
    return notices.onScreen.filter((bar) => bar.politeness === politeness);
  }

  function contentOf(bar: ShownNotice): Attachment<HTMLElement> {
    return (target) => bar.mountInto(target, context);
  }

  function jumpToNotices(): void {
    region.element?.focus();
  }
</script>

<svelte:window {@attach shortcut({ key: JUMP_KEY, run: jumpToNotices })} />

<Portal to={slot ?? "body"} disabled={slot === undefined}>
  <section
    {@attach region.watches}
    aria-label={m.notice_region()}
    aria-keyshortcuts={JUMP_KEY}
    tabindex="-1"
    data-floating={slot === undefined || undefined}
    class="group/info-bars flex flex-col focus-visible:focus-ring data-floating:fixed data-floating:inset-x-sm data-floating:inset-bs-native-info-bar-floating-top data-floating:z-notice"
  >
    {#each POLITENESS_ORDER as politeness (politeness)}
      <div
        aria-live={politeness}
        aria-relevant="additions text"
        aria-atomic="false"
        class="flex flex-col"
      >
        {#each barsAnnounced(politeness) as bar (bar.id)}
          <div
            data-info-bar
            hidden={!visibleIds.has(bar.id)}
            class="mbe-md group-data-floating/info-bars:mbe-sm"
            {@attach contentOf(bar)}
          ></div>
        {/each}
      </div>
    {/each}
  </section>
</Portal>
