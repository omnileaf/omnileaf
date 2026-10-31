<script lang="ts">
  import { ChevronsLeft, ChevronsRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { SeriesNeighbour } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { readerButton, readerIconSize } from "./reader-bar.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderIcon from "./ReaderIcon.svelte";

  type Step = "previous" | "next";

  const STEPS = {
    previous: {
      label: m.reader_previous_chapter,
      unavailable: m.reader_no_previous_chapter,
      icon: ChevronsLeft,
      kitIcon: "chevrons-left",
    },
    next: {
      label: m.reader_next_chapter,
      unavailable: m.reader_no_next_chapter,
      icon: ChevronsRight,
      kitIcon: "chevrons-right",
    },
  } as const satisfies Record<Step, unknown>;

  let { step, neighbour }: { step: Step; neighbour: SeriesNeighbour | null } =
    $props();

  const shape = $derived(STEPS[step]);
  const chrome = getReaderChrome();
  const look = $derived(readerButton(chrome.platform, chrome.width));
</script>

{#if neighbour === null}
  <Tooltip
    label={shape.unavailable()}
    type="button"
    aria-disabled="true"
    aria-label={shape.unavailable()}
  >
    {#snippet child({ props })}
      <Button
        {...props}
        look="icon"
        class={[look, !chrome.isCommandBar && "opacity-40"]}
      >
        <ReaderIcon
          name={shape.kitIcon}
          fallback={shape.icon}
          isKit={chrome.isOnPhone}
          size={readerIconSize(chrome.platform)}
        />
      </Button>
    {/snippet}
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
        class={look}
      >
        <ReaderIcon
          name={shape.kitIcon}
          fallback={shape.icon}
          isKit={chrome.isOnPhone}
          size={readerIconSize(chrome.platform)}
        />
      </a>
    {/snippet}
  </Tooltip>
{/if}
