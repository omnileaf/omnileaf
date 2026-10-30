<script lang="ts">
  import { Portal } from "bits-ui";
  import { getAllContexts } from "svelte";
  import type { Attachment } from "svelte/attachments";

  import { m } from "#lib/paraglide/messages.js";

  import type { NoticeRegion } from "./notice-region.svelte";
  import type { Notices, ShownNotice } from "./notices";
  import { pageNoticeSlot } from "./page-notice-slot.svelte";

  const SHOWN_AT_ONCE = 3;

  let { notices, region }: { notices: Notices; region: NoticeRegion } =
    $props();

  const context = getAllContexts<Map<unknown, unknown>>();
  const bars = $derived(notices.onScreen.slice(0, SHOWN_AT_ONCE));
  const slot = $derived(pageNoticeSlot.element);

  function contentOf(bar: ShownNotice): Attachment<HTMLElement> {
    return (target) => bar.mountInto(target, context);
  }
</script>

<Portal to={slot ?? "body"} disabled={slot === undefined}>
  <section
    bind:this={region.element}
    aria-label={m.notice_region()}
    aria-live="polite"
    aria-relevant="additions text"
    aria-atomic="false"
    data-floating={slot === undefined || undefined}
    class="group/info-bars flex flex-col data-floating:fixed data-floating:inset-x-sm data-floating:inset-bs-native-info-bar-floating-top data-floating:z-notice data-floating:gap-sm"
    onfocusin={region.noteFocusArriving}
    onfocusout={region.noteFocusLeaving}
    onclickcapture={region.returnFocusFromButton}
    onpointerdown={region.noteTap}
    onpointerenter={region.notePointerEntering}
    onpointerleave={region.notePointerLeaving}
  >
    {#each bars as bar (bar.id)}
      <div
        data-info-bar
        role={bar.politeness === "assertive" ? "alert" : "status"}
        aria-atomic="true"
        class="not-group-data-floating/info-bars:mbe-md"
        {@attach contentOf(bar)}
      ></div>
    {/each}
  </section>
</Portal>
