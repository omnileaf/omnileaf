<script lang="ts" generics="Item">
  import { onMount, type Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { rowWindow, type Seen } from "./row-window";

  let {
    items,
    key,
    label,
    isComplete,
    onNearEnd,
    cell,
    class: className,
    itemClass,
  }: {
    items: readonly Item[];
    key: (item: Item) => string;
    label: string;
    isComplete: boolean;
    onNearEnd?: () => void;
    cell: Snippet<[Item]>;
    class?: ClassValue;
    itemClass?: ClassValue;
  } = $props();

  const ITEMS_BEFORE_MEASURING = 24;
  const EXTRA_ROWS = 2;
  const NEAR_END_ROWS = 6;
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
    const style = getComputedStyle(grid);
    const columns = style.gridTemplateColumns
      .split(" ")
      .filter((track) => track !== "").length;
    const rowGap = Number.parseFloat(style.rowGap);
    return {
      columns: Math.max(1, columns),
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
    }
  }

  function isSameMeasure(one: Measure, other: Measure | undefined): boolean {
    return (
      other !== undefined &&
      one.columns === other.columns &&
      one.rowStride === other.rowStride
    );
  }

  let pendingLook: number | undefined;

  function lookNextFrame(): void {
    pendingLook ??= requestAnimationFrame(() => {
      pendingLook = undefined;
      look();
    });
  }

  onMount(() => {
    look();
    const resized = new ResizeObserver(lookNextFrame);
    if (frame !== undefined) {
      resized.observe(frame);
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
  <ul bind:this={list} aria-label={label} class={["grid", className]}>
    {#each items.slice(shown.start, shown.end) as item, offset (key(item))}
      <li
        aria-posinset={shown.start + offset + 1}
        aria-setsize={setSize}
        class={itemClass}
      >
        {@render cell(item)}
      </li>
    {/each}
  </ul>
</div>
