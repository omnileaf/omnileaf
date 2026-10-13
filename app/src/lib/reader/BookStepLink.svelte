<script lang="ts">
  import {
    ChevronLeft,
    ChevronRight,
    SkipBack,
    SkipForward,
  } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { SeriesNeighbour } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  type Step = "previous" | "next";

  const ICON_SIZE = 20;
  const ICON_SIZE_WIDE = 18;
  const STEPS = {
    previous: {
      label: m.reader_previous_book,
      unavailable: m.reader_no_previous_book,
      icon: SkipBack,
      wideIcon: ChevronLeft,
      order: "",
    },
    next: {
      label: m.reader_next_book,
      unavailable: m.reader_no_next_book,
      icon: SkipForward,
      wideIcon: ChevronRight,
      order: "flex-row-reverse",
    },
  } as const satisfies Record<Step, unknown>;

  let { step, neighbour }: { step: Step; neighbour: SeriesNeighbour | null } =
    $props();

  const shape = $derived(STEPS[step]);
  const look = $derived([
    "relative flex shrink-0 items-center justify-center rounded-full text-on-reader transition-control block-reader-control inline-reader-control expanded:gap-2xs expanded:rounded-reader-control-wide expanded:px-xs expanded:text-detail expanded:font-semibold expanded:block-reader-slider-wide expanded:inline-auto android:before:absolute android:before:block-touch-target android:before:inline-touch-target",
    shape.order,
  ]);
</script>

{#if neighbour === null}
  <Tooltip
    label={shape.unavailable()}
    type="button"
    aria-disabled="true"
    aria-label={shape.unavailable()}
    class={[look, "opacity-40"]}
  >
    <shape.icon size={ICON_SIZE} aria-hidden="true" class="expanded:hidden" />
    <shape.wideIcon
      size={ICON_SIZE_WIDE}
      aria-hidden="true"
      class="hidden expanded:block"
    />
  </Tooltip>
{:else}
  {@const label = shape.label({ title: neighbour.title })}
  <Tooltip {label}>
    {#snippet child({ props })}
      <a
        {...props}
        href={resolve("/read/[book]", { book: neighbour.id })}
        data-sveltekit-replacestate
        aria-label={label}
        class={[look, "hover:tint-reader-hover active:tint-reader-pressed"]}
      >
        <shape.icon
          size={ICON_SIZE}
          aria-hidden="true"
          class="expanded:hidden"
        />
        <shape.wideIcon
          size={ICON_SIZE_WIDE}
          aria-hidden="true"
          class="hidden expanded:block"
        />
        <span
          class="hidden truncate max-inline-reader-book-step expanded:inline"
        >
          {neighbour.title}
        </span>
      </a>
    {/snippet}
  </Tooltip>
{/if}
