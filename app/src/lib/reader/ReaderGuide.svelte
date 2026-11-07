<script lang="ts">
  import { Hand, MousePointerClick } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    Card,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { readerGuideLook } from "./reader-guide-look.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import type { TapZones } from "./reader-settings.svelte.ts";
  import type { ReadingDirection } from "./reading-direction.svelte.ts";

  const ICON_SIZE = 20;

  let {
    direction,
    zones = "edges",
    isStrip = false,
    isTouch,
    onDone,
  }: {
    direction: ReadingDirection;
    zones?: TapZones;
    isStrip?: boolean;
    isTouch: boolean;
    onDone: () => void;
  } = $props();

  const titleId = $props.id();
  const chrome = getReaderChrome();
  const look = $derived(readerGuideLook(chrome.platform, chrome.width));
  const isReversed = $derived(direction === "rightToLeft");
  const edgesBody = $derived(
    isTouch
      ? isReversed
        ? m.reader_guide_tap_body_rtl()
        : m.reader_guide_tap_body()
      : isReversed
        ? m.reader_guide_click_body_rtl()
        : m.reader_guide_click_body(),
  );
  const edges = $derived([
    {
      label: isReversed ? m.reader_next_page() : m.reader_previous_page(),
      isControls: false,
    },
    { label: m.reader_show_controls(), isControls: true },
    {
      label: isReversed ? m.reader_previous_page() : m.reader_next_page(),
      isControls: false,
    },
  ]);
  const stripZones = $derived([
    { label: m.reader_scroll_up(), isControls: false },
    { label: m.reader_show_controls(), isControls: true },
    { label: m.reader_scroll_down(), isControls: false },
  ]);
  const stripWording = $derived(
    isTouch
      ? {
          title: m.reader_guide_strip_tap_title(),
          body: m.reader_guide_strip_tap_body(),
        }
      : {
          title: m.reader_guide_strip_click_title(),
          body: m.reader_guide_strip_click_body(),
        },
  );
  const zoneWording = $derived(
    {
      edges: {
        title: isTouch
          ? m.reader_guide_tap_title()
          : m.reader_guide_click_title(),
        body: edgesBody,
      },
      lShape: {
        title: m.reader_guide_l_title(),
        body: m.reader_guide_l_body(),
      },
      off: {
        title: m.reader_guide_off_title(),
        body: m.reader_guide_off_body(),
      },
    }[zones],
  );
  const wording = $derived(isStrip ? stripWording : zoneWording);
</script>

{#if isStrip}
  <div
    aria-hidden="true"
    class={[
      "pointer-events-none absolute inset-none grid grid-strip-zones",
      look.overlay,
    ]}
  >
    {#each stripZones as zone (zone.label)}
      <div
        class={[
          zone.isControls ? look.controlsZone : look.zone,
          "items-center",
        ]}
      >
        {zone.label}
      </div>
    {/each}
  </div>
{:else if zones === "edges"}
  <div
    aria-hidden="true"
    class={["pointer-events-none absolute inset-none flex", look.overlay]}
  >
    {#each edges as zone, index (index)}
      <div class={zone.isControls ? look.controlsEdgeZone : look.edgeZone}>
        {zone.label}
      </div>
    {/each}
  </div>
{:else if zones === "lShape"}
  <div
    aria-hidden="true"
    class={[
      "pointer-events-none absolute inset-none grid grid-l-zones",
      look.overlay,
    ]}
  >
    <div class={[look.zone, "col-span-3"]}>{m.reader_previous_page()}</div>
    <div class={look.zone}>
      {isReversed ? m.reader_next_page() : m.reader_previous_page()}
    </div>
    <div class={look.controlsZone}>
      {m.reader_show_controls()}
    </div>
    <div class={look.zone}>
      {isReversed ? m.reader_previous_page() : m.reader_next_page()}
    </div>
    <div class={[look.zone, "col-span-3"]}>{m.reader_next_page()}</div>
  </div>
{:else}
  <div
    aria-hidden="true"
    class={["pointer-events-none absolute inset-none flex", look.overlay]}
  >
    <div class={[look.zone, "flex-1 items-center"]}>
      {m.reader_guide_off_zone()}
    </div>
  </div>
{/if}
<Card
  role="note"
  aria-labelledby={titleId}
  class={[
    "absolute inset-x-lg flex flex-col py-lg shadow-reader-glass expanded:inset-x-none expanded:mx-auto expanded:inline-reader-guide-wide",
    look.card,
  ]}
>
  <CardHeader class="px-lg">
    <div class="flex items-center gap-sm">
      {#if look.hasBadge}
        <span
          class="flex items-center justify-center rounded-shadcn-control bg-chip block-reader-dense inline-reader-dense"
        >
          {#if isTouch}
            <Hand size={ICON_SIZE} aria-hidden="true" />
          {:else}
            <MousePointerClick size={ICON_SIZE} aria-hidden="true" />
          {/if}
        </span>
      {/if}
      <CardTitle id={titleId} class={look.title}>
        {wording.title}
      </CardTitle>
    </div>
    <CardDescription class={look.body}>{wording.body}</CardDescription>
  </CardHeader>
  <CardFooter class="px-lg expanded:justify-end">
    <Button
      type="button"
      {...look.doneButton}
      class={look.done}
      onclick={onDone}
    >
      {m.reader_guide_done()}
    </Button>
  </CardFooter>
</Card>
