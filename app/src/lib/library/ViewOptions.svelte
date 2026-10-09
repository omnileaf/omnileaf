<script lang="ts">
  import { SlidersHorizontal } from "@lucide/svelte";

  import type {
    LibraryDisplay,
    LibraryView,
    OnCovers,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import CoversPerRowStepper from "./CoversPerRowStepper.svelte";
  import DisplayChoice from "./DisplayChoice.svelte";
  import ItemCountsChoice from "./ItemCountsChoice.svelte";
  import OnCoversChoice from "./OnCoversChoice.svelte";
  import {
    SCREEN_SIZES,
    type ScreenSize,
    withCoversPerRow,
    withDisplay,
    withItemCounts,
    withOnCovers,
  } from "./library-view";

  const ICON_SIZE = 22;

  /** Each size's stepper shows only while the screen is that size, so only the covers per row in view change. */
  const STEPPERS = {
    phone: "flex medium:hidden",
    tablet: "hidden medium:flex large:hidden",
    desktop: "hidden large:flex",
  } satisfies Record<ScreenSize, string>;

  interface ButtonEdge {
    readonly blockEnd: number;
    readonly inlineEnd: number;
  }

  let {
    view,
    onChoose,
  }: { view: LibraryView; onChoose: (view: LibraryView) => void } = $props();

  let button: HTMLButtonElement | undefined = $state();
  let dialog: HTMLDialogElement | undefined = $state();
  let isOpen = $state(false);
  let edge: ButtonEdge = $state({ blockEnd: 0, inlineEnd: 0 });

  const titleId = $props.id();

  function edgeOf(opener: HTMLButtonElement): ButtonEdge {
    const box = opener.getBoundingClientRect();
    const isRightToLeft = getComputedStyle(opener).direction === "rtl";
    return {
      blockEnd: box.bottom,
      inlineEnd: isRightToLeft ? box.left : window.innerWidth - box.right,
    };
  }

  function open(): void {
    if (button === undefined || dialog === undefined) {
      return;
    }
    edge = edgeOf(button);
    dialog.showModal();
    isOpen = true;
  }

  function close(): void {
    dialog?.close();
  }

  $effect(() => {
    if (!isOpen) {
      return;
    }
    const follow = (): void => {
      if (button !== undefined) {
        edge = edgeOf(button);
      }
    };
    window.addEventListener("resize", follow, { passive: true });
    return () => {
      window.removeEventListener("resize", follow);
    };
  });
</script>

<button
  bind:this={button}
  type="button"
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  aria-label={m.library_view_options()}
  title={m.library_view_options()}
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
</button>

<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  style:--button-block-end={`${String(edge.blockEnd)}px`}
  style:--button-inline-end={`${String(edge.inlineEnd)}px`}
  class="m-none mbs-auto overflow-y-auto border-0 border-border bg-card p-none text-foreground max-block-full backdrop:bg-scrim max-medium:rounded-ss-bottom-sheet max-medium:rounded-se-bottom-sheet max-medium:inline-full max-medium:max-inline-full medium:anchored-below-button medium:rounded-card medium:border medium:shadow-popover medium:inline-view-panel medium:backdrop:bg-transparent"
  onclose={() => {
    isOpen = false;
    button?.focus();
  }}
  onclick={(event) => {
    if (event.target === dialog) {
      close();
    }
  }}
>
  <div
    class="flex flex-col gap-sheet-gap px-sheet-inline pbs-sm pbe-sheet-bottom medium:gap-lg medium:px-panel-inline medium:pbs-lg medium:pbe-panel-inline"
  >
    <span
      aria-hidden="true"
      class="self-center rounded-full bg-step-off block-sheet-handle-block inline-sheet-handle medium:hidden"
    ></span>
    <div class="flex items-center">
      <h2
        id={titleId}
        class="flex-1 text-title font-bold medium:text-panel-title"
      >
        {m.library_view()}
      </h2>
      <button
        type="button"
        class="rounded-control px-xs text-body font-semibold text-accent transition-control min-block-touch-target hover:bg-hover active:bg-pressed medium:hidden"
        onclick={close}
      >
        {m.library_view_done()}
      </button>
    </div>
    <DisplayChoice
      chosen={view.display}
      onChoose={(display: LibraryDisplay) => {
        onChoose(withDisplay(view, display));
      }}
    />
    {#each SCREEN_SIZES as size (size)}
      <CoversPerRowStepper
        {size}
        count={view.coversPerRow[size]}
        class={STEPPERS[size]}
        onCount={(count: number) => {
          onChoose(withCoversPerRow(view, size, count));
        }}
      />
    {/each}
    <ItemCountsChoice
      isShown={view.showsItemCounts}
      onChoose={(isShown: boolean) => {
        onChoose(withItemCounts(view, isShown));
      }}
    />
    <OnCoversChoice
      onCovers={view.onCovers}
      onChoose={(name: keyof OnCovers, isShown: boolean) => {
        onChoose(withOnCovers(view, name, isShown));
      }}
    />
  </div>
</dialog>
