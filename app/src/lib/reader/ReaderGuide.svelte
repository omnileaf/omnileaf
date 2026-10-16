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

  import type { TapZones } from "./reader-settings.svelte.ts";
  import type { ReadingDirection } from "./reading-direction.svelte.ts";

  const ICON_SIZE = 20;

  let {
    direction,
    zones = "edges",
    isTouch,
    onDone,
  }: {
    direction: ReadingDirection;
    zones?: TapZones;
    isTouch: boolean;
    onDone: () => void;
  } = $props();

  const titleId = $props.id();
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
    isReversed ? m.reader_next_page() : m.reader_previous_page(),
    m.reader_show_controls(),
    isReversed ? m.reader_previous_page() : m.reader_next_page(),
  ]);
  const wording = $derived(
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
  const ZONE_LABEL =
    "flex items-start justify-center border border-dashed border-foreground/60 px-sm pbs-reader-guide-labels text-center text-body font-medium text-foreground expanded:text-group-title";
</script>

{#if zones === "edges"}
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-none flex bg-reader-black/40"
  >
    {#each edges as zone, index (index)}
      <div
        class="flex flex-1 items-start justify-center border-e border-dashed border-foreground/60 px-sm pbs-reader-guide-labels text-center text-body font-medium text-foreground last:border-e-0 expanded:text-group-title"
      >
        {zone}
      </div>
    {/each}
  </div>
{:else if zones === "lShape"}
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-none grid grid-l-zones bg-reader-black/40"
  >
    <div class={[ZONE_LABEL, "col-span-3"]}>{m.reader_previous_page()}</div>
    <div class={ZONE_LABEL}>
      {isReversed ? m.reader_next_page() : m.reader_previous_page()}
    </div>
    <div class={ZONE_LABEL}>{m.reader_show_controls()}</div>
    <div class={ZONE_LABEL}>
      {isReversed ? m.reader_previous_page() : m.reader_next_page()}
    </div>
    <div class={[ZONE_LABEL, "col-span-3"]}>{m.reader_next_page()}</div>
  </div>
{:else}
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-none flex bg-reader-black/40"
  >
    <div class={[ZONE_LABEL, "flex-1 items-center"]}>
      {m.reader_guide_off_zone()}
    </div>
  </div>
{/if}
<Card
  role="note"
  aria-labelledby={titleId}
  class="absolute inset-x-lg inset-be-reader-guide flex flex-col gap-lg py-lg shadow-reader-glass expanded:inset-x-none expanded:mx-auto expanded:inline-reader-guide-wide"
>
  <CardHeader class="px-lg">
    <div class="flex items-center gap-sm">
      <span
        class="flex items-center justify-center rounded-shadcn-control bg-chip block-reader-dense inline-reader-dense"
      >
        {#if isTouch}
          <Hand size={ICON_SIZE} aria-hidden="true" />
        {:else}
          <MousePointerClick size={ICON_SIZE} aria-hidden="true" />
        {/if}
      </span>
      <CardTitle id={titleId} class="text-group-title">
        {wording.title}
      </CardTitle>
    </div>
    <CardDescription class="text-body expanded:text-small"
      >{wording.body}</CardDescription
    >
  </CardHeader>
  <CardFooter class="px-lg expanded:justify-end">
    <Button
      type="button"
      look="primary"
      class="flex-1 rounded-shadcn-control px-lg font-medium min-block-touch-target expanded:flex-none expanded:text-small expanded:min-block-pointer-button"
      onclick={onDone}
    >
      {m.reader_guide_done()}
    </Button>
  </CardFooter>
</Card>
