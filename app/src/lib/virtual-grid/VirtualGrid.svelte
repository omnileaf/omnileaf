<script lang="ts" generics="Item">
  import { onMount, type Snippet, tick } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { columnsOf, optionId, type Reveal } from "./grid-keys";
  import { rowWindow, type Seen } from "./row-window";
  import { scrollerOf } from "./scroller";
  import {
    headingsBefore,
    offsetOf,
    type Stack,
    stackWindow,
  } from "./stack-window";

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

  interface Measure {
    readonly columns: number;
    readonly rowStride: number;
    readonly headingStride: number;
  }

  interface Shown {
    readonly start: number;
    readonly end: number;
    readonly before: number;
    readonly size: number;
  }

  let frame: HTMLDivElement | undefined = $state();
  let list: HTMLUListElement | undefined = $state();
  let measure: Measure | undefined = $state();
  let seen: Seen = $state({ top: 0, bottom: 0 });

  const knownTotal = $derived(
    total !== undefined && total >= items.length ? total : undefined,
  );
  const count = $derived(knownTotal ?? items.length);
  const headingCounts = $derived(
    isHeading === undefined ? undefined : headingsBefore(items.map(isHeading)),
  );
  const stack: Stack | undefined = $derived(
    headingCounts === undefined ||
      measure === undefined ||
      measure.columns !== 1
      ? undefined
      : {
          count,
          heights: { row: measure.rowStride, heading: measure.headingStride },
          headingsBefore: headingCounts,
        },
  );
  const shown: Shown | undefined = $derived.by(() => {
    if (measure === undefined) {
      return undefined;
    }
    if (stack !== undefined) {
      return stackWindow(stack, seen, EXTRA_ROWS);
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

  function measured(grid: HTMLUListElement): Measure | undefined {
    const rows = measuredRows(grid);
    if (rows === undefined) {
      return undefined;
    }
    return {
      ...rows,
      headingStride:
        measuredHeadingStride(grid) ?? measure?.headingStride ?? rows.rowStride,
    };
  }

  function rowGapOf(grid: Element | null): number {
    if (grid === null) {
      return 0;
    }
    const rowGap = Number.parseFloat(getComputedStyle(grid).rowGap);
    return Number.isNaN(rowGap) ? 0 : rowGap;
  }

  function strideFrom(item: Element, next: Element | null): number {
    const top = item.getBoundingClientRect().top;
    return next === null
      ? item.getBoundingClientRect().height + rowGapOf(item.parentElement)
      : next.getBoundingClientRect().top - top;
  }

  function measuredHeadingStride(grid: HTMLUListElement): number | undefined {
    const heading = grid.querySelector(":scope > [data-heading]");
    return heading === null
      ? undefined
      : strideFrom(heading, heading.nextElementSibling);
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
        rowStride: strideFrom(measuredPair.row, measuredPair.next),
      };
    }
    const isPartDrawn = grid.childElementCount < count;
    if (isPartDrawn && measure?.columns === columns) {
      return measure;
    }
    return { columns, rowStride: strideFrom(first, null) };
  }

  function look(): void {
    if (frame === undefined || list === undefined) {
      return;
    }
    const top = -frame.getBoundingClientRect().top;
    seen = { top, bottom: top + window.innerHeight };
    const latest = measured(list);
    if (latest !== undefined && !isSameMeasure(latest, measure)) {
      measure = latest;
      onColumns?.(latest.columns);
    }
  }

  function isSameMeasure(one: Measure, other: Measure | undefined): boolean {
    return (
      other !== undefined &&
      one.columns === other.columns &&
      one.rowStride === other.rowStride &&
      one.headingStride === other.headingStride
    );
  }

  function placeOf(index: number, at: Measure): { top: number; size: number } {
    if (stack !== undefined) {
      const top = offsetOf(stack, index);
      return { top, size: offsetOf(stack, index + 1) - top };
    }
    return {
      top: Math.floor(index / at.columns) * at.rowStride,
      size: at.rowStride,
    };
  }

  async function revealItem(index: number): Promise<HTMLElement | undefined> {
    if (frame === undefined || list === undefined) {
      return undefined;
    }
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
      look();
      await tick();
    }
    const item = list.children.item(index - drawn.start);
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
      look();
    });
  }

  onMount(() => {
    onRevealReady?.(revealItem);
    look();
    const resized = new ResizeObserver(lookNextFrame);
    const restyled = new MutationObserver(look);
    if (list !== undefined) {
      restyled.observe(list, { attributeFilter: ["class", "style"] });
    }
    for (const laidOut of [frame, list]) {
      if (laidOut !== undefined) {
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
    {#each items.slice(drawn.start, drawn.end) as item, offset (key(item))}
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
