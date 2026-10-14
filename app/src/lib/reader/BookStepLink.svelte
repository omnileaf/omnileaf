<script lang="ts">
  import { ChevronsLeft, ChevronsRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { SeriesNeighbour } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { READER_BUTTON, READER_ICON_SIZE } from "./reader-bar.ts";

  type Step = "previous" | "next";

  const ICON_SIZE = READER_ICON_SIZE;
  const STEPS = {
    previous: {
      label: m.reader_previous_chapter,
      unavailable: m.reader_no_previous_chapter,
      icon: ChevronsLeft,
    },
    next: {
      label: m.reader_next_chapter,
      unavailable: m.reader_no_next_chapter,
      icon: ChevronsRight,
    },
  } as const satisfies Record<Step, unknown>;

  const LOOK = READER_BUTTON;

  let { step, neighbour }: { step: Step; neighbour: SeriesNeighbour | null } =
    $props();

  const shape = $derived(STEPS[step]);
</script>

{#if neighbour === null}
  <Tooltip
    label={shape.unavailable()}
    type="button"
    aria-disabled="true"
    aria-label={shape.unavailable()}
  >
    {#snippet child({ props })}
      <Button {...props} look="icon" class={[LOOK, "opacity-40"]}>
        <shape.icon size={ICON_SIZE} aria-hidden="true" />
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
        class={LOOK}
      >
        <shape.icon size={ICON_SIZE} aria-hidden="true" />
      </a>
    {/snippet}
  </Tooltip>
{/if}
