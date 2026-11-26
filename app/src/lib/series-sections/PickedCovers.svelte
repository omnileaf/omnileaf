<script lang="ts">
  import { tick } from "svelte";

  import { beforeNavigate } from "$app/navigation";
  import type { ResolvedPathname } from "$app/types";
  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import DragBox from "#lib/library/DragBox.svelte";
  import { DragSelect } from "#lib/library/drag-select.svelte.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { Selection } from "#lib/page/selection.svelte.ts";
  import { endsOnBack } from "#lib/page/selection-back.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { ANDROID_PICKING } from "#lib/series/phone-picking.ts";
  import PickingToolbar from "#lib/series/PickingToolbar.svelte";
  import PickingTopBar from "#lib/series/PickingTopBar.svelte";
  import SelectionBar from "#lib/series/SelectionBar.svelte";
  import { shortcut } from "#lib/shortcut.ts";

  import SectionCovers from "./SectionCovers.svelte";
  import {
    booksPicked,
    type PickKey,
    pickKeysOf,
    picksAVolumeStillComing,
    type SectionTile,
  } from "./section-tiles";

  type BookId = SeriesBook["id"];

  type Outcome =
    | { readonly kind: "none" }
    | {
        readonly kind: "marked";
        readonly mark: ReadMark;
        readonly count: number;
      }
    | { readonly kind: "failed" }
    | { readonly kind: "pickedAll"; readonly count: number };

  let {
    onMark,
    onLoadAll,
    onPickedCount,
    tiles,
    ...covers
  }: {
    tiles: readonly SectionTile[];
    label: string;
    isComplete: boolean;
    onNearEnd: () => void;
    usesStandIns: boolean;
    volumePage: (volume: number) => ResolvedPathname;
    onMark: (books: BookId[], mark: ReadMark) => Promise<boolean>;
    onLoadAll: () => Promise<void>;
    onPickedCount?: ((count: number | undefined) => void) | undefined;
  } = $props();

  const selection = new Selection<PickKey>();
  const dragSelect = new DragSelect(selection, {
    cells: "[data-pick-key]",
    idOf: (cell) =>
      pickKeysOf(tiles).find((key) => key === cell.dataset.pickKey),
  });
  const pickedBooks = $derived(booksPicked(tiles, (key) => selection.has(key)));
  const platform = currentPlatform();
  const width = new WindowWidth();
  const countId = $props.id();
  const isAndroidPhonePicking = $derived(
    phoneOf(platform, width.current) === "android" && selection.isSelecting,
  );
  let outcome: Outcome = $state({ kind: "none" });
  let area: HTMLElement | undefined = $state();
  let bar: HTMLElement | undefined = $state();
  let topBar: HTMLElement | undefined = $state();
  let isPickingAll = $state(false);
  let lastPickedCount = 0;

  $effect(() => {
    const count = selection.count;
    if (isAndroidPhonePicking && count === 0 && lastPickedCount > 0) {
      void end();
    }
    lastPickedCount = count;
  });

  $effect(() => {
    const report = onPickedCount;
    report?.(pickedBooks.length > 0 ? pickedBooks.length : undefined);
    return () => {
      report?.(undefined);
    };
  });
  let focusedTile: string | undefined;

  function noteFocusedBook({ target }: FocusEvent): void {
    const cover =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-pick-key]")
        : null;
    focusedTile = cover?.dataset.pickKey ?? focusedTile;
  }

  function isFocusHereOrLost(): boolean {
    const focused = document.activeElement;
    return (
      focused === null ||
      focused === document.body ||
      [area, bar, topBar].some((part) => part?.contains(focused) === true)
    );
  }

  function coverLinkToFocus(): HTMLElement | null | undefined {
    const focused =
      focusedTile === undefined
        ? null
        : area?.querySelector<HTMLElement>(
            `[data-pick-key="${CSS.escape(focusedTile)}"] [data-pickable-link]`,
          );
    return focused ?? area?.querySelector<HTMLElement>("[data-pickable-link]");
  }

  async function end(): Promise<void> {
    const isFocusToKeep = isFocusHereOrLost();
    selection.end();
    if (isFocusToKeep) {
      await tick();
      coverLinkToFocus()?.focus();
    }
  }

  async function pickAll(): Promise<void> {
    selection.begin();
    isPickingAll = true;
    try {
      await onLoadAll();
    } finally {
      isPickingAll = false;
    }
    await tick();
    selection.pickAll(pickKeysOf(tiles));
    await tick();
    if (!isAndroidPhonePicking) {
      outcome = { kind: "pickedAll", count: pickedBooks.length };
    }
  }

  endsOnBack(
    () => selection.isSelecting,
    () => {
      void end();
    },
  );

  beforeNavigate((navigation) => {
    if (
      navigation.type === "popstate" &&
      navigation.delta < 0 &&
      selection.isSelecting
    ) {
      navigation.cancel();
      void end();
    }
  });

  async function mark(read: ReadMark): Promise<void> {
    if (
      picksAVolumeStillComing(
        tiles,
        (key) => selection.has(key),
        covers.isComplete,
      )
    ) {
      await onLoadAll();
      await tick();
    }
    const picked = pickedBooks;
    const isMarked = await onMark(picked, read);
    outcome = isMarked
      ? { kind: "marked", mark: read, count: picked.length }
      : { kind: "failed" };
    if (isMarked) {
      await end();
    }
  }

  function announced(shown: Outcome): string {
    switch (shown.kind) {
      case "none":
        return "";
      case "marked":
        return shown.mark === "read"
          ? m.series_marked_read({ count: shown.count })
          : m.series_marked_unread({ count: shown.count });
      case "failed":
        return m.series_mark_failed();
      case "pickedAll":
        return m.series_selected_count({ count: shown.count });
    }
  }
</script>

<svelte:window
  {@attach shortcut(
    ...(selection.isSelecting
      ? [
          {
            key: "Escape",
            run: () => {
              void end();
            },
          },
        ]
      : []),
    {
      key: "a",
      command: platform,
      run: () => {
        void pickAll();
      },
    },
  )}
/>

<div
  bind:this={area}
  data-picking={isAndroidPhonePicking || undefined}
  class="contents"
  onfocusin={noteFocusedBook}
>
  <div class="relative" {@attach dragSelect.attach}>
    <SectionCovers {...covers} {tiles} {selection} />
    {#if dragSelect.box !== undefined}
      <DragBox box={dragSelect.box} />
    {/if}
  </div>
  {#if isAndroidPhonePicking}
    <PickingTopBar
      bind:element={topBar}
      picking={ANDROID_PICKING}
      look={ANDROID_PICKING.overTopBar}
      count={pickedBooks.length}
      {countId}
      {isPickingAll}
      isAllPicked={false}
      onEnd={() => {
        void end();
      }}
      onPickAll={() => {
        void pickAll();
      }}
      onPickNone={() => {
        selection.pickOnly([]);
      }}
    />
    <PickingToolbar
      bind:element={bar}
      picking={ANDROID_PICKING}
      count={pickedBooks.length}
      onMark={(read: ReadMark) => {
        void mark(read);
      }}
    />
  {:else if pickedBooks.length > 0}
    <SelectionBar
      bind:element={bar}
      count={pickedBooks.length}
      onMark={(read: ReadMark) => {
        void mark(read);
      }}
      onClear={() => {
        void end();
      }}
    />
  {/if}
  <p
    role="status"
    class={outcome.kind === "failed" ? "text-body text-danger" : "sr-only"}
  >
    {announced(outcome)}
  </p>
</div>
