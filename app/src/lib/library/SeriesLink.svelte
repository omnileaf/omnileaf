<script lang="ts">
  import { type Snippet, tick } from "svelte";
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
    onkeydown,
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
  let element: HTMLElement | undefined = $state();

  async function startPickingFromKeys(event: KeyboardEvent): Promise<void> {
    if (event.key !== " " || selection === undefined) {
      return;
    }
    event.preventDefault();
    selection.begin(id);
    await tick();
    element?.focus();
  }

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
    bind:this={element}
    data-series-link
    type="button"
    role="checkbox"
    aria-checked={selection.has(id)}
    aria-label={title}
    class={["text-start", className]}
    onclick={pick}
  >
    {@render children()}
  </button>
{:else}
  <a
    {...rest}
    bind:this={element}
    data-series-link
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
    onkeydown={(event) => {
      onkeydown?.(event);
      void startPickingFromKeys(event);
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
