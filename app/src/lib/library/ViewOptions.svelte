<script lang="ts">
  import { SlidersHorizontal } from "@lucide/svelte";
  import { Dialog, Popover } from "bits-ui";
  import { MediaQuery } from "svelte/reactivity";

  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent } from "#lib/components/ui/drawer/index.ts";
  import { PopoverContent } from "#lib/components/ui/popover/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { LibraryView } from "#lib/ipc/bindings.ts";
  import { MEDIUM_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ViewChoices from "./ViewChoices.svelte";

  const ICON_SIZE = 22;

  let {
    view,
    coversDrawn,
    onChoose,
  }: {
    view: LibraryView;
    coversDrawn: number | undefined;
    onChoose: (view: LibraryView) => void;
  } = $props();

  const isWide = new MediaQuery(MEDIUM_QUERY);
  const titleId = $props.id();

  let button = $state<HTMLElement | null>(null);
  let isOpen = $state(false);
  let direction: "ltr" | "rtl" = $state("ltr");

  function open(): void {
    if (button !== null) {
      direction = getComputedStyle(button).direction === "rtl" ? "rtl" : "ltr";
    }
    isOpen = true;
  }

  function close(): void {
    isOpen = false;
  }

  function focusButton(event: Event): void {
    event.preventDefault();
    button?.focus();
  }
</script>

<Tooltip
  bind:ref={button}
  label={m.library_view_options()}
  type="button"
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  aria-label={m.library_view_options()}
  class={[
    "flex items-center justify-center gap-sm rounded-full transition-control block-touch-target inline-touch-target large:rounded-control large:border large:border-field large:px-header-control-inline large:text-small large:font-medium large:block-pointer-button large:inline-auto",
    isOpen
      ? "large:bg-accent-soft"
      : "hover:tint-hover active:tint-pressed large:bg-card",
  ]}
  onclick={open}
>
  <SlidersHorizontal
    size={ICON_SIZE}
    aria-hidden="true"
    class="large:block-header-icon-desktop large:inline-header-icon-desktop"
  />
  <span class="hidden large:inline">{m.library_view()}</span>
</Tooltip>

{#if isWide.current}
  <Popover.Root bind:open={isOpen}>
    <PopoverContent
      customAnchor={button}
      dir={direction}
      align="end"
      aria-labelledby={titleId}
      class="flex flex-col gap-lg overflow-auto px-panel-inline pbs-lg pbe-panel-inline inline-view-panel max-block-full"
      onCloseAutoFocus={focusButton}
    >
      <h2 id={titleId} class="text-panel-title font-bold">
        {m.library_view()}
      </h2>
      <ViewChoices {view} {coversDrawn} {onChoose} />
    </PopoverContent>
  </Popover.Root>
{:else}
  <Dialog.Root bind:open={isOpen}>
    <DrawerContent onDismiss={close} onCloseAutoFocus={focusButton}>
      <div class="flex items-center px-sheet-inline pbs-sheet-gap">
        <DialogTitle class="flex-1 text-title font-bold">
          {m.library_view()}
        </DialogTitle>
        <button
          type="button"
          class="rounded-control px-xs text-body font-semibold text-accent transition-control min-block-touch-target hover:bg-hover active:bg-pressed"
          onclick={close}
        >
          {m.library_view_done()}
        </button>
      </div>
      <div
        class="flex flex-col gap-sheet-gap overflow-auto px-sheet-inline pbs-sheet-gap pbe-sheet-bottom min-block-none"
      >
        <ViewChoices {view} {coversDrawn} {onChoose} />
      </div>
    </DrawerContent>
  </Dialog.Root>
{/if}
