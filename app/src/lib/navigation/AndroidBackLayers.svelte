<script lang="ts">
  import { ANDROID_BACK_TRANSITIONS, placedTransform } from "./back-preview";
  import type { AndroidBackPreview } from "./android-back-preview.svelte";
  import { type ScreenCopy, showCopy } from "./previous-screens";

  /** Android dims the page behind a back gesture with black, not the theme's scrim colour. */
  const SCRIM_COLOUR = "black";

  let {
    preview,
    behind,
    cornerPx,
  }: {
    preview: AndroidBackPreview;
    behind: ScreenCopy | undefined;
    cornerPx: number;
  } = $props();

  const frame = $derived(preview.frame);
  const isCancelling = $derived(preview.phase === "cancelling");
  const enteringPlace = $derived(
    (isCancelling ? preview.restingFrame : frame)?.entering,
  );
</script>

{#if preview.area !== undefined && frame !== undefined && (preview.phase === "following" || isCancelling)}
  <div
    aria-hidden="true"
    inert
    data-previous-screen
    class="pointer-events-none fixed overflow-hidden"
    style:left="{preview.area.left}px"
    style:top="{preview.area.top}px"
    style:width="{preview.area.width}px"
    style:height="{preview.area.height}px"
  >
    <div
      class="flex flex-col overflow-hidden bg-background block-full inline-full"
      style:transform={enteringPlace === undefined
        ? undefined
        : placedTransform(enteringPlace)}
      style:transition={isCancelling
        ? ANDROID_BACK_TRANSITIONS.springBack
        : undefined}
      style:border-radius="{cornerPx}px"
    >
      {#if behind !== undefined}
        <div class="contents" {@attach showCopy(behind)}></div>
      {/if}
    </div>
    <div
      class="absolute inset-none"
      style:background-color={SCRIM_COLOUR}
      style:opacity={frame.scrim}
    ></div>
  </div>
{/if}
{#if preview.area !== undefined && preview.leaving !== undefined}
  {@const leaving = preview.leaving}
  <div
    aria-hidden="true"
    inert
    data-leaving-screen
    class="pointer-events-none fixed z-notice overflow-hidden"
    style:left="{preview.area.left}px"
    style:top="{preview.area.top}px"
    style:width="{preview.area.width}px"
    style:height="{preview.area.height}px"
  >
    <div
      class="absolute inset-none"
      style:background-color={SCRIM_COLOUR}
      style:opacity={preview.hasLeft ? 0 : leaving.scrim}
      style:transition={ANDROID_BACK_TRANSITIONS.leavingScrim}
    ></div>
    <div
      class="flex flex-col overflow-hidden bg-background block-full inline-full"
      style:transform={placedTransform(
        preview.hasLeft ? leaving.to : leaving.from,
      )}
      style:opacity={preview.hasLeft ? 0 : 1}
      style:border-radius="{cornerPx}px"
      style:transition={ANDROID_BACK_TRANSITIONS.leaving}
    >
      <div class="contents" {@attach showCopy(leaving.copy)}></div>
    </div>
  </div>
{/if}
