<script lang="ts">
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { toast, type ToasterProps } from "svelte-sonner";

  import type { Theme } from "#lib/appearance/theme.ts";
  import { Toaster } from "#lib/components/ui/sonner/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { focusPageHeading } from "#lib/navigation/page-heading.ts";
  import { MEDIUM_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { shortcut } from "#lib/shortcut.ts";

  import type { Notices } from "./notices";
  import { setUndoShortcut, undoShortcutOn } from "./undo-shortcut";

  type Side = "left" | "right";

  const PHONE_OFFSET = { left: 0, right: 0, bottom: "var(--spacing-md)" };
  const CORNER_OFFSET = {
    left: "var(--spacing-notice-end)",
    right: "var(--spacing-notice-end)",
    bottom: "var(--spacing-page-bottom)",
  };

  let {
    notices,
    platform,
    theme,
  }: { notices: Notices; platform: Platform; theme: Theme } = $props();

  setUndoShortcut(untrack(() => undoShortcutOn(platform)));

  const endSide: Side = document.dir === "rtl" ? "left" : "right";
  const position: ToasterProps["position"] = `bottom-${endSide}`;
  const isWide = new MediaQuery(MEDIUM_QUERY);
  const swipeDirections: ToasterProps["swipeDirections"] = $derived(
    isWide.current ? [endSide] : ["bottom"],
  );

  let region: HTMLElement | undefined;
  let cameFrom: HTMLElement | undefined;
  let isPointerOver = $state(false);
  let isFocusWithin = $state(false);
  let isTapped = $state(false);
  const isSpread = $derived(isPointerOver || isFocusWithin || isTapped);

  $effect(() => {
    if (toast.getActiveToasts().length === 0) {
      isPointerOver = false;
      isFocusWithin = false;
      isTapped = false;
    }
  });

  $effect(() => {
    if (isSpread) {
      notices.hold();
    } else {
      notices.release();
    }
  });

  function isInside(target: EventTarget | null): boolean {
    return target instanceof Node && region?.contains(target) === true;
  }

  function noteFocusArriving(event: FocusEvent): void {
    isFocusWithin = true;
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !isInside(from)) {
      cameFrom = from;
    }
  }

  function noteFocusLeaving(event: FocusEvent): void {
    if (!isInside(event.relatedTarget)) {
      isFocusWithin = false;
    }
  }

  function returnFocus(): void {
    if (!isInside(document.activeElement)) {
      return;
    }
    if (cameFrom?.isConnected === true) {
      cameFrom.focus();
    } else {
      focusPageHeading();
    }
  }

  function returnFocusFromButton(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest("button")) {
      returnFocus();
    }
  }

  function noteTap(event: PointerEvent): void {
    if (event.pointerType !== "mouse") {
      isTapped = true;
    }
  }

  function forgetTapElsewhere(event: PointerEvent): void {
    if (!isInside(event.target)) {
      isTapped = false;
    }
  }

  function undoFromKeyboard(): void {
    if (notices.undoOffer === undefined) {
      return;
    }
    returnFocus();
    notices.undo();
  }
</script>

<svelte:window
  {@attach shortcut({
    key: "z",
    command: platform,
    shift: false,
    run: undoFromKeyboard,
  })}
  onpointerdown={forgetTapElsewhere}
/>

<div
  bind:this={region}
  role="presentation"
  onfocusin={noteFocusArriving}
  onfocusout={noteFocusLeaving}
  onclickcapture={returnFocusFromButton}
  onpointerdown={noteTap}
  onpointerenter={(event) => {
    isPointerOver = event.pointerType === "mouse";
  }}
  onpointerleave={() => {
    isPointerOver = false;
  }}
>
  <Toaster
    {theme}
    {position}
    {swipeDirections}
    expand={isSpread}
    offset={CORNER_OFFSET}
    mobileOffset={PHONE_OFFSET}
    containerAriaLabel={m.notice_region()}
    class="max-medium:absolute! medium:toast-list-width!"
    toastOptions={{ class: "max-medium:px-md" }}
  />
</div>
