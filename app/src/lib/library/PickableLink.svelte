<script lang="ts" generics="Id">
  import { type Snippet, tick } from "svelte";
  import type { ClassValue, HTMLAnchorAttributes } from "svelte/elements";

  import { goto } from "$app/navigation";
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
    picksOnClick = false,
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
    picksOnClick?: boolean;
    children: Snippet;
  } = $props();

  const longPress = new LongPress(LONG_PRESS_MS);
  let element: HTMLElement | undefined = $state();
  const choosesOnClick = $derived(picksOnClick && selection !== undefined);

  function isPlainPointerClick(event: MouseEvent): boolean {
    return (
      event.detail > 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey
    );
  }

  async function startPickingFromKeys(event: KeyboardEvent): Promise<void> {
    if (event.key !== " " || selection === undefined) {
      return;
    }
    event.preventDefault();
    selection.begin(id);
    await tick();
    element?.focus();
  }

  function open(): void {
    void goto(href);
  }

  function opensOnReturn(event: KeyboardEvent): void {
    if (
      choosesOnClick &&
      event.key === "Enter" &&
      !event.repeat &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      open();
    }
  }

  function opensOnDoubleClick(): void {
    if (choosesOnClick) {
      open();
    }
  }

  function pick(event: MouseEvent): void {
    if (isReleaseOfHold(id, event)) {
      return;
    }
    if (event.shiftKey) {
      selection?.extendTo(id, order());
    } else if (choosesOnClick && isPlainPointerClick(event)) {
      selection?.chooseOnly(id);
    } else {
      selection?.toggle(id);
    }
    if (choosesOnClick) {
      element?.focus();
    }
  }

  async function chooseFromClick(event: MouseEvent): Promise<void> {
    if (
      !choosesOnClick ||
      selection === undefined ||
      event.defaultPrevented ||
      !isPlainPointerClick(event)
    ) {
      return;
    }
    event.preventDefault();
    selection.chooseOnly(id);
    await tick();
    element?.focus();
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
    ondblclick={opensOnDoubleClick}
    onkeydown={opensOnReturn}
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
    ondblclick={opensOnDoubleClick}
    onkeydown={(event) => {
      onkeydown?.(event);
      opensOnReturn(event);
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
      void chooseFromClick(event);
    }}
  >
    {@render children()}
  </a>
{/if}
