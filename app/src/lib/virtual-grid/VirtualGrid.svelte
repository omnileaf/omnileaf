<script lang="ts" generics="Item">
  import { onMount, type Snippet, tick } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { columnsOf, optionId, type Reveal } from "./grid-keys";
  import { rowWindow, type Seen } from "./row-window";

  /** A list whose choices a field moves through, naming the active one in its aria-activedescendant. */
  interface Listbox {
    readonly id: string;
    readonly activeKey: string | undefined;
    readonly onChoose: (item: Item) => void;
  }

  let {
    items,
    key,
    label,
    isComplete,
    onNearEnd,
    onColumns,
    cell,
    class: className,
    style,
    itemClass,
    listbox,
    onRevealReady,
  }: {
    items: readonly Item[];
    key: (item: Item) => string;
    label: string;
    isComplete: boolean;
    onNearEnd?: () => void;
    onColumns?: (columns: number) => void;
    cell: Snippet<[Item]>;
    class?: ClassValue;
    style?: string;
    itemClass?: ClassValue;
    listbox?: Listbox | undefined;
    onRevealReady?: ((reveal: Reveal) => void) | undefined;
  } = $props();

  const ITEMS_BEFORE_MEASURING = 24;
  const EXTRA_ROWS = 2;
  const NEAR_END_ROWS = 2;
  const UNKNOWN_SIZE = -1;

  interface Measure {
    readonly columns: number;
    readonly rowStride: number;
  }

  let frame: HTMLDivElement | undefined = $state();
  let list: HTMLUListElement | undefined = $state();
  let measure: Measure | undefined = $state();
  let seen: Seen = $state({ top: 0, bottom: 0 });

  const shown = $derived(
    measure === undefined
      ? {
          firstRow: 0,
          rows: 0,
          start: 0,
          end: Math.min(items.length, ITEMS_BEFORE_MEASURING),
        }
      : rowWindow({ count: items.length, ...measure }, seen, EXTRA_ROWS),
  );

  const setSize = $derived(isComplete ? items.length : UNKNOWN_SIZE);

  function measured(grid: HTMLUListElement): Measure | undefined {
    const first = grid.firstElementChild;
    if (first === null) {
      return undefined;
    }
    const rowGap = Number.parseFloat(getComputedStyle(grid).rowGap);
    return {
      columns: columnsOf(grid),
      rowStride:
        first.getBoundingClientRect().height +
        (Number.isNaN(rowGap) ? 0 : rowGap),
    };
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
      one.rowStride === other.rowStride
    );
  }

  /** The nearest ancestor that scrolls, which the grid's rows scroll in. */
  function scrollerOf(element: Element): Element {
    for (
      let ancestor = element.parentElement;
      ancestor !== null;
      ancestor = ancestor.parentElement
    ) {
      if (/auto|scroll/u.test(getComputedStyle(ancestor).overflowY)) {
        return ancestor;
      }
    }
    return document.scrollingElement ?? document.documentElement;
  }

  async function revealItem(index: number): Promise<HTMLElement | undefined> {
    if (frame === undefined || list === undefined) {
      return undefined;
    }
    const isDrawn = index >= shown.start && index < shown.end;
    if (measure !== undefined && !isDrawn) {
      const scroller = scrollerOf(frame);
      const view = scroller.getBoundingClientRect();
      const rowTop =
        frame.getBoundingClientRect().top +
        Math.floor(index / measure.columns) * measure.rowStride;
      const below = rowTop + measure.rowStride - view.bottom;
      scroller.scrollBy({
        top: rowTop < view.top ? rowTop - view.top : Math.max(0, below),
      });
      look();
      await tick();
    }
    const item = list.querySelector<HTMLElement>(
      `:scope > [aria-posinset="${String(index + 1)}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
    return item ?? undefined;
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
    if (shown.end + measure.columns * NEAR_END_ROWS >= items.length) {
      onNearEnd?.();
    }
  });
</script>

<div
  bind:this={frame}
  class="virtual-rows"
  style:--first-row={measure === undefined ? undefined : shown.firstRow}
  style:--row-count={measure === undefined ? undefined : shown.rows}
  style:--row-stride={measure === undefined
    ? undefined
    : `${String(measure.rowStride)}px`}
>
  <ul
    bind:this={list}
    id={listbox?.id}
    role={listbox === undefined ? undefined : "listbox"}
    aria-label={label}
    class={["grid", className]}
    {style}
  >
    {#each items.slice(shown.start, shown.end) as item, offset (key(item))}
      <li
        id={listbox === undefined ? undefined : optionId(listbox.id, key(item))}
        role={listbox === undefined ? undefined : "option"}
        aria-selected={listbox === undefined
          ? undefined
          : key(item) === listbox.activeKey}
        onclick={listbox === undefined
          ? undefined
          : () => {
              listbox.onChoose(item);
            }}
        aria-posinset={shown.start + offset + 1}
        aria-setsize={setSize}
        class={itemClass}
      >
        {@render cell(item)}
      </li>
    {/each}
  </ul>
</div>
