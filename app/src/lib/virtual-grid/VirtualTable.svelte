<script lang="ts" generics="Item">
  import { onMount, type Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { Table, TableBody } from "#lib/components/ui/table/index.ts";

  import { rowWindow, type Seen } from "./row-window";

  let {
    items,
    key,
    label,
    columns,
    isComplete,
    onNearEnd,
    head,
    row,
    class: className,
  }: {
    items: readonly Item[];
    key: (item: Item) => string;
    label: string;
    columns: number;
    isComplete: boolean;
    onNearEnd?: () => void;
    head: Snippet;
    row: Snippet<[Item, number]>;
    class?: ClassValue;
  } = $props();

  const ROWS_BEFORE_MEASURING = 24;
  const EXTRA_ROWS = 2;
  const NEAR_END_ROWS = 2;
  const UNKNOWN_COUNT = -1;
  const HEADING_ROWS = 1;

  let body = $state<HTMLTableSectionElement | null>(null);
  let rowStride: number | undefined = $state();
  let seen: Seen = $state({ top: 0, bottom: 0 });

  const shown = $derived(
    rowStride === undefined
      ? { start: 0, end: Math.min(items.length, ROWS_BEFORE_MEASURING) }
      : rowWindow(
          { count: items.length, columns: 1, rowStride },
          seen,
          EXTRA_ROWS,
        ),
  );
  const spaceBefore = $derived((rowStride ?? 0) * shown.start);
  const spaceAfter = $derived((rowStride ?? 0) * (items.length - shown.end));

  function firstRowHeight(
    laidOut: HTMLTableSectionElement,
  ): number | undefined {
    const first = laidOut.querySelector(":scope > tr:not([aria-hidden])");
    return first?.getBoundingClientRect().height;
  }

  function look(): void {
    if (body === null) {
      return;
    }
    const top = -body.getBoundingClientRect().top;
    seen = { top, bottom: top + window.innerHeight };
    const height = firstRowHeight(body);
    if (height !== undefined && height > 0) {
      rowStride = height;
    }
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
    if (body !== null) {
      resized.observe(body);
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
    if (rowStride === undefined || isComplete) {
      return;
    }
    if (shown.end + NEAR_END_ROWS >= items.length) {
      onNearEnd?.();
    }
  });
</script>

<Table
  aria-label={label}
  aria-rowcount={isComplete ? items.length + HEADING_ROWS : UNKNOWN_COUNT}
  class={className}
>
  {@render head()}
  <TableBody bind:ref={body}>
    {#if spaceBefore > 0}
      <tr aria-hidden="true">
        <td colspan={columns} style:block-size="{spaceBefore}px"></td>
      </tr>
    {/if}
    {#each items.slice(shown.start, shown.end) as item, offset (key(item))}
      {@render row(item, shown.start + offset + HEADING_ROWS + 1)}
    {/each}
    {#if spaceAfter > 0}
      <tr aria-hidden="true">
        <td colspan={columns} style:block-size="{spaceAfter}px"></td>
      </tr>
    {/if}
  </TableBody>
</Table>
