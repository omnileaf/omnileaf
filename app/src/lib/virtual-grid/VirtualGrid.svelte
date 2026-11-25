<script lang="ts" generics="Item">
  import { onMount, type Snippet, tick } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { shownScaleOf } from "#lib/page/shown-scale.ts";

  import { columnsOf, optionId, type Reveal } from "./grid-keys";
  import { rowWindow, type Seen } from "./row-window";
  import { scrollerOf } from "./scroller";
  import { RowHeights, stackWindow } from "./stack-window";

  interface Listbox {
    readonly id: string;
    readonly activeKey: string | undefined;
    readonly onChoose: (item: Item) => void;
    readonly onActivate?: ((item: Item) => void) | undefined;
  }

  let {
    items,
    key,
    label,
    isComplete,
    total,
    onNearEnd,
    onColumns,
    cell,
    class: className,
    style,
    itemClass,
    listbox,
    onRevealReady,
    itemRole,
    isHeading,
  }: {
    items: readonly Item[];
    key: (item: Item) => string;
    label: string;
    isComplete: boolean;
    /** How many items the whole list holds, when known before they've all come, so the grid keeps room for every one. */
    total?: number | undefined;
    onNearEnd?: () => void;
    onColumns?: (columns: number) => void;
    cell: Snippet<[Item]>;
    class?: ClassValue;
    style?: string;
    itemClass?: ClassValue;
    listbox?: Listbox | undefined;
    onRevealReady?: ((reveal: Reveal) => void) | undefined;
    itemRole?: ((item: Item) => "listitem" | "presentation") | undefined;
    isHeading?: ((item: Item) => boolean) | undefined;
  } = $props();

  const ITEMS_BEFORE_MEASURING = 24;
  const EXTRA_ROWS = 2;
  const NEAR_END_ROWS = 2;
  const UNKNOWN_SIZE = -1;
  const MOST_LOOKS_IN_A_FRAME = 4;

  interface Measure {
    readonly columns: number;
    readonly rowStride: number;
    readonly headingStride: number;
  }

  interface Sizing {
    readonly inlineSize: number;
    readonly fontSize: string;
    readonly textScale: string;
  }

  interface Shown {
    readonly start: number;
    readonly end: number;
    readonly before: number;
    readonly size: number;
  }

  let frame = $state<HTMLDivElement | null>(null);
  let list = $state<HTMLUListElement | null>(null);
  let measure: Measure | undefined = $state();
  let seen: Seen = $state({ top: 0, bottom: 0 });
  let rowSizes: ReadonlyMap<string, number> = $state(new Map());
  let sizedFor: Sizing | undefined;

  const knownTotal = $derived(
    total !== undefined && total >= items.length ? total : undefined,
  );
  const count = $derived(knownTotal ?? items.length);
  const headings = $derived(
    isHeading === undefined ? [] : items.map(isHeading),
  );
  const indexByKey = $derived(
    new Map(items.map((item, index) => [key(item), index])),
  );
  const sizesByIndex = $derived(
    new Map(
      [...rowSizes].flatMap(([itemKey, size]) => {
        const index = indexByKey.get(itemKey);
        return index === undefined ? [] : [[index, size] as const];
      }),
    ),
  );
  const heights: RowHeights | undefined = $derived(
    measure === undefined || measure.columns !== 1
      ? undefined
      : new RowHeights(
          {
            count,
            isHeading: headings,
            strides: { row: measure.rowStride, heading: measure.headingStride },
          },
          sizesByIndex,
        ),
  );
  const shown: Shown | undefined = $derived.by(() => {
    if (measure === undefined) {
      return undefined;
    }
    if (heights !== undefined) {
      return stackWindow(heights, seen, EXTRA_ROWS);
    }
    const rows = rowWindow({ count, ...measure }, seen, EXTRA_ROWS);
    return {
      start: rows.start,
      end: rows.end,
      before: rows.firstRow * measure.rowStride,
      size: rows.rows * measure.rowStride,
    };
  });
  const drawn = $derived(
    shown ?? { start: 0, end: Math.min(items.length, ITEMS_BEFORE_MEASURING) },
  );
  const drawnItems = $derived(items.slice(drawn.start, drawn.end));

  const positions = $derived(listedPositions(items));
  const setSize = $derived(
    isComplete ? positions.listed : (knownTotal ?? UNKNOWN_SIZE),
  );

  function isPresentation(item: Item): boolean {
    return itemRole?.(item) === "presentation";
  }

  function listedPositions(all: readonly Item[]) {
    let listed = 0;
    const at = all.map((item) => {
      if (isPresentation(item)) {
        return undefined;
      }
      listed += 1;
      return listed;
    });
    return { at, listed };
  }

  function measured(
    grid: HTMLUListElement,
    scale: number,
  ): Measure | undefined {
    const rows = measuredRows(grid, scale);
    if (rows === undefined) {
      return undefined;
    }
    return {
      ...rows,
      headingStride:
        measuredHeadingStride(grid, scale) ??
        measure?.headingStride ??
        rows.rowStride,
    };
  }

  function rowGapOf(grid: Element | null): number {
    if (grid === null) {
      return 0;
    }
    const rowGap = Number.parseFloat(getComputedStyle(grid).rowGap);
    return Number.isNaN(rowGap) ? 0 : rowGap;
  }

  function strideFrom(
    item: Element,
    next: Element | null,
    scale: number,
  ): number {
    const top = item.getBoundingClientRect().top;
    return next === null
      ? item.getBoundingClientRect().height / scale +
          rowGapOf(item.parentElement)
      : (next.getBoundingClientRect().top - top) / scale;
  }

  function measuredHeadingStride(
    grid: HTMLUListElement,
    scale: number,
  ): number | undefined {
    const heading = grid.querySelector(":scope > [data-heading]");
    return heading === null
      ? undefined
      : strideFrom(heading, heading.nextElementSibling, scale);
  }

  function rowAfter(first: Element, columns: number): Element | null {
    let next: Element | null = first;
    for (let step = 0; step < columns && next !== null; step += 1) {
      next = next.nextElementSibling;
    }
    return next?.hasAttribute("data-heading") === true ? null : next;
  }

  function measuredRows(
    grid: HTMLUListElement,
    scale: number,
  ): Pick<Measure, "columns" | "rowStride"> | undefined {
    const columns = columnsOf(grid);
    const rows = [...grid.querySelectorAll(":scope > :not([data-heading])")];
    const first = rows[0];
    if (first === undefined) {
      return undefined;
    }
    const measuredPair = rows
      .map((row) => ({ row, next: rowAfter(row, columns) }))
      .find(({ next }) => next !== null);
    if (measuredPair !== undefined) {
      return {
        columns,
        rowStride: strideFrom(measuredPair.row, measuredPair.next, scale),
      };
    }
    const isPartDrawn = grid.childElementCount < count;
    if (isPartDrawn && measure?.columns === columns) {
      return measure;
    }
    return { columns, rowStride: strideFrom(first, null, scale) };
  }

  async function look(): Promise<void> {
    for (let pass = 0; pass < MOST_LOOKS_IN_A_FRAME; pass += 1) {
      if (!(await lookOnce())) {
        return;
      }
    }
  }

  async function lookOnce(): Promise<boolean> {
    if (frame === null || list === null) {
      return false;
    }
    const shownFrame = frame;
    const grid = list;
    const scale = shownScaleOf(grid);
    const top = -shownFrame.getBoundingClientRect().top / scale;
    seen = { top, bottom: top + window.innerHeight / scale };
    const latest = measured(grid, scale);
    if (latest !== undefined && !isSameMeasure(latest, measure)) {
      measure = latest;
      onColumns?.(latest.columns);
    }
    await tick();
    return shownFrame.isConnected && (await remeasureRows(shownFrame, grid));
  }

  function drawnSizeOf(
    row: Element,
    index: number,
    scale: number,
  ): number | undefined {
    const next = row.nextElementSibling;
    if (next !== null) {
      return strideFrom(row, next, scale);
    }
    return index === count - 1
      ? row.getBoundingClientRect().height / scale
      : undefined;
  }

  function drawnRowSizes(grid: HTMLUListElement): ReadonlyMap<string, number> {
    const scale = shownScaleOf(grid);
    return new Map(
      [...grid.children].flatMap((row, offset) => {
        const item = drawnItems[offset];
        const size = drawnSizeOf(row, drawn.start + offset, scale);
        return item === undefined || size === undefined
          ? []
          : [[key(item), size] as const];
      }),
    );
  }

  function sizingOf(grid: HTMLUListElement): Sizing {
    const style = getComputedStyle(grid);
    return {
      inlineSize: grid.getBoundingClientRect().width,
      fontSize: style.fontSize,
      textScale: style.getPropertyValue("--text-scale"),
    };
  }

  function isSameSizing(one: Sizing, other: Sizing | undefined): boolean {
    return (
      other !== undefined &&
      one.inlineSize === other.inlineSize &&
      one.fontSize === other.fontSize &&
      one.textScale === other.textScale
    );
  }

  async function remeasureRows(
    shownFrame: HTMLDivElement,
    grid: HTMLUListElement,
  ): Promise<boolean> {
    if (heights === undefined) {
      return false;
    }
    const sizing = sizingOf(grid);
    const isResized = !isSameSizing(sizing, sizedFor);
    const kept = isResized ? new Map<string, number>() : rowSizes;
    const changes = [...drawnRowSizes(grid)].filter(
      ([itemKey, size]) => kept.get(itemKey) !== size,
    );
    if (!isResized && changes.length === 0) {
      return false;
    }
    sizedFor = sizing;
    const atTop = heights.rowAt(seen.top);
    const before = heights.offsetOf(atTop);
    rowSizes = new Map([
      ...[...kept].filter(([itemKey]) => indexByKey.has(itemKey)),
      ...changes,
    ]);
    const moved = heights.offsetOf(atTop) - before;
    if (moved !== 0) {
      await tick();
      if (shownFrame.isConnected) {
        scrollerOf(shownFrame).scrollBy({ top: moved });
      }
    }
    return shownFrame.isConnected;
  }

  function isPlacedByRowSizes(at: Measure): boolean {
    return at.columns === 1 && rowSizes.size > 0;
  }

  function isSameMeasure(one: Measure, other: Measure | undefined): boolean {
    return (
      other !== undefined &&
      one.columns === other.columns &&
      one.headingStride === other.headingStride &&
      (one.rowStride === other.rowStride || isPlacedByRowSizes(one))
    );
  }

  function placeOf(index: number, at: Measure): { top: number; size: number } {
    if (heights !== undefined) {
      const top = heights.offsetOf(index);
      return { top, size: heights.offsetOf(index + 1) - top };
    }
    return {
      top: Math.floor(index / at.columns) * at.rowStride,
      size: at.rowStride,
    };
  }

  async function revealItem(index: number): Promise<HTMLElement | undefined> {
    if (frame === null || list === null) {
      return undefined;
    }
    const grid = list;
    const isDrawn = index >= drawn.start && index < drawn.end;
    if (measure !== undefined && !isDrawn) {
      const scroller = scrollerOf(frame);
      const view = scroller.getBoundingClientRect();
      const place = placeOf(index, measure);
      const rowTop = frame.getBoundingClientRect().top + place.top;
      const below = rowTop + place.size - view.bottom;
      scroller.scrollBy({
        top: rowTop < view.top ? rowTop - view.top : Math.max(0, below),
      });
      await look();
    }
    if (!grid.isConnected) {
      return undefined;
    }
    const item = grid.children.item(index - drawn.start);
    if (!(item instanceof HTMLElement)) {
      return undefined;
    }
    item.scrollIntoView({ block: "nearest" });
    return item;
  }

  let pendingLook: number | undefined;

  function lookNextFrame(): void {
    pendingLook ??= requestAnimationFrame(() => {
      pendingLook = undefined;
      void look();
    });
  }

  onMount(() => {
    onRevealReady?.(revealItem);
    void look();
    const resized = new ResizeObserver(lookNextFrame);
    const restyled = new MutationObserver(() => {
      void look();
    });
    if (list !== null) {
      restyled.observe(list, { attributeFilter: ["class", "style"] });
    }
    for (const laidOut of [frame, list]) {
      if (laidOut !== null) {
        resized.observe(laidOut);
      }
    }
    document.addEventListener("scroll", lookNextFrame, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", lookNextFrame, { passive: true });
    return () => {
      if (pendingLook !== undefined) {
        cancelAnimationFrame(pendingLook);
      }
      resized.disconnect();
      restyled.disconnect();
      document.removeEventListener("scroll", lookNextFrame, { capture: true });
      window.removeEventListener("resize", lookNextFrame);
    };
  });

  $effect(() => {
    if (measure === undefined || isComplete) {
      return;
    }
    if (drawn.end + measure.columns * NEAR_END_ROWS >= items.length) {
      onNearEnd?.();
    }
  });
</script>

<div
  bind:this={frame}
  class="virtual-rows"
  style:--rows-before={shown === undefined
    ? undefined
    : `${String(shown.before)}px`}
  style:--rows-size={shown === undefined
    ? undefined
    : `${String(shown.size)}px`}
>
  <ul
    bind:this={list}
    id={listbox?.id}
    role={listbox === undefined ? undefined : "listbox"}
    aria-label={label}
    class={["grid", className]}
    {style}
  >
    {#each drawnItems as item, offset (key(item))}
      <li
        id={listbox === undefined ? undefined : optionId(listbox.id, key(item))}
        role={listbox === undefined
          ? isPresentation(item)
            ? "presentation"
            : undefined
          : "option"}
        aria-selected={listbox === undefined
          ? undefined
          : key(item) === listbox.activeKey}
        onclick={listbox === undefined
          ? undefined
          : () => {
              listbox.onChoose(item);
            }}
        ondblclick={listbox?.onActivate === undefined
          ? undefined
          : () => {
              listbox.onActivate?.(item);
            }}
        onmousedown={listbox?.onActivate === undefined
          ? undefined
          : (event) => {
              event.preventDefault();
            }}
        aria-posinset={positions.at[drawn.start + offset]}
        data-heading={isHeading?.(item) === true || undefined}
        aria-setsize={isPresentation(item) ? undefined : setSize}
        class={itemClass}
      >
        {@render cell(item)}
      </li>
    {/each}
  </ul>
</div>
