<script lang="ts">
  import { Portal } from "bits-ui";
  import { toast } from "svelte-sonner";

  import { m } from "#lib/paraglide/messages.js";

  import type { NoticeRegion } from "./notice-region.svelte";
  import { pageNoticeSlot } from "./page-notice-slot.svelte";

  const SHOWN_AT_ONCE = 3;

  let { region }: { region: NoticeRegion } = $props();

  const bars = $derived(toast.getActiveToasts().slice(0, SHOWN_AT_ONCE));
  const slot = $derived(pageNoticeSlot.element);
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
        role={bar.important === true ? "alert" : "status"}
        aria-atomic="true"
        class="not-group-data-floating/info-bars:mbe-md"
      >
        {#if bar.component !== undefined}
          <bar.component {...bar.componentProps} />
        {/if}
      </div>
    {/each}
  </section>
</Portal>
