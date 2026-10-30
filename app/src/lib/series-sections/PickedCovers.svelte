<script lang="ts">
  import { tick } from "svelte";

  import { beforeNavigate } from "$app/navigation";
  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import DragBox from "#lib/library/DragBox.svelte";
  import { DragSelect } from "#lib/library/drag-select.svelte.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { Selection } from "#lib/page/selection.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SelectionBar from "#lib/series/SelectionBar.svelte";
  import { shortcut } from "#lib/shortcut.ts";

  import SectionCovers from "./SectionCovers.svelte";
  import { bookIdsOf, type SectionTile } from "./section-tiles";

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
    onMark: (books: BookId[], mark: ReadMark) => Promise<boolean>;
    onLoadAll: () => Promise<void>;
    onPickedCount?: ((count: number | undefined) => void) | undefined;
  } = $props();

  const selection = new Selection<BookId>();
  const dragSelect = new DragSelect(selection, {
    cells: "[data-book-id]",
    idOf: (cell) =>
      bookIdsOf(tiles).find((book) => book === cell.dataset.bookId),
  });
  const platform = currentPlatform();
  let outcome: Outcome = $state({ kind: "none" });
  let area: HTMLElement | undefined = $state();
  let bar: HTMLElement | undefined = $state();

  $effect(() => {
    const report = onPickedCount;
    report?.(selection.count > 0 ? selection.count : undefined);
    return () => {
      report?.(undefined);
    };
  });
  let focusedBook: string | undefined;

  function noteFocusedBook({ target }: FocusEvent): void {
    const cover =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-book-id]")
        : null;
    focusedBook = cover?.dataset.bookId ?? focusedBook;
  }

  function isFocusHereOrLost(): boolean {
    const focused = document.activeElement;
    return (
      focused === null ||
      focused === document.body ||
      [area, bar].some((part) => part?.contains(focused) === true)
    );
  }

  function coverLinkToFocus(): HTMLElement | null | undefined {
    const focused =
      focusedBook === undefined
        ? null
        : area?.querySelector<HTMLElement>(
            `[data-book-id="${CSS.escape(focusedBook)}"] [data-pickable-link]`,
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
    await onLoadAll();
    await tick();
    selection.pickAll(bookIdsOf(tiles));
    outcome = { kind: "pickedAll", count: selection.count };
  }

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
    const picked = selection.picked;
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

<div bind:this={area} class="contents" onfocusin={noteFocusedBook}>
  <div class="relative" {@attach dragSelect.attach}>
    <SectionCovers {...covers} {tiles} {selection} />
    {#if dragSelect.box !== undefined}
      <DragBox box={dragSelect.box} />
    {/if}
  </div>
  {#if selection.count > 0}
    <SelectionBar
      bind:element={bar}
      count={selection.count}
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
