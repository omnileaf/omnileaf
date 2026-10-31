<script lang="ts" generics="Id">
  import { type Snippet, tick } from "svelte";
  import type { ClassValue, HTMLAnchorAttributes } from "svelte/elements";

  import type { ResolvedPathname } from "$app/types";
  import { LongPress } from "#lib/components/long-press.ts";
  import type { Selection } from "#lib/page/selection.svelte.ts";

  import { isReleaseOfHold, noteHeld } from "./held-pick";

  const LONG_PRESS_MS = 500;
  const FOCUS_RING =
    "rounded-cover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  let {
    id,
    href,
    title,
    selection,
    order,
    class: className,
    focusRing = FOCUS_RING,
    children,
    onpointerdown,
    onpointerup,
    onpointercancel,
    onpointerleave,
    onclick,
    onkeydown,
    ...rest
  }: Omit<HTMLAnchorAttributes, "class" | "href"> & {
    id: Id;
    href: ResolvedPathname;
    title: string;
    selection: Selection<Id> | undefined;
    order: () => readonly Id[];
    class?: ClassValue;
    focusRing?: string | undefined;
    children: Snippet;
  } = $props();

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
    data-pickable-link
    type="button"
    role="checkbox"
    aria-checked={selection.has(id)}
    aria-label={title}
    class={["text-start inline-full", focusRing, className]}
    onclick={pick}
  >
    {@render children()}
  </button>
{:else}
  <a
    {...rest}
    bind:this={element}
    data-pickable-link
    {href}
    class={[focusRing, className]}
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
