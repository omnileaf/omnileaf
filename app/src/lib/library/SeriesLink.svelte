<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue, HTMLAnchorAttributes } from "svelte/elements";

  import { resolve } from "$app/paths";
  import { LongPress } from "#lib/components/long-press.ts";
  import type { SeriesId } from "#lib/series/series-id.ts";

  import {
    isReleaseOfHold,
    noteHeld,
    seriesSelection,
  } from "./series-selection";

  const LONG_PRESS_MS = 500;

  let {
    id,
    title,
    order,
    class: className,
    children,
    onpointerdown,
    onpointerup,
    onpointercancel,
    onpointerleave,
    onclick,
    ...rest
  }: Omit<HTMLAnchorAttributes, "class" | "href"> & {
    id: SeriesId;
    title: string;
    order: () => readonly SeriesId[];
    class?: ClassValue;
    children: Snippet;
  } = $props();

  const selection = seriesSelection();
  const longPress = new LongPress(LONG_PRESS_MS);

  function pick(event: MouseEvent): void {
    if (isReleaseOfHold(id, event)) {
      return;
    }
    if (event.shiftKey) {
      selection?.extendTo(id, order());
    } else {
      selection?.toggle(id);
    }
  }

  function startPicking(event: MouseEvent): void {
    if (selection === undefined) {
      return;
    }
    event.preventDefault();
    selection.begin();
    pick(event);
  }
</script>

{#if selection?.isSelecting === true}
  <button
    type="button"
    role="checkbox"
    aria-checked={selection.has(id)}
    aria-label={title}
    class={["text-start inline-full", className]}
    onclick={pick}
  >
    {@render children()}
  </button>
{:else}
  <a
    {...rest}
    href={resolve("/(app)/series/[id]", { id })}
    class={className}
    onpointerdown={(event) => {
      onpointerdown?.(event);
      longPress.pointerWentDown();
      longPress.pressed(event, () => {
        noteHeld(id);
        selection?.begin(id);
      });
    }}
    onpointerup={(event) => {
      onpointerup?.(event);
      longPress.released();
    }}
    onpointercancel={(event) => {
      onpointercancel?.(event);
      longPress.released();
    }}
    onpointerleave={(event) => {
      onpointerleave?.(event);
      longPress.released();
    }}
    onclick={(event) => {
      longPress.clicked(event);
      if (event.defaultPrevented) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        startPicking(event);
        return;
      }
      onclick?.(event);
    }}
  >
    {@render children()}
  </a>
{/if}
