<script lang="ts">
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { ToasterProps } from "svelte-sonner";

  import type { Theme } from "#lib/appearance/theme.ts";
  import { Toaster } from "#lib/components/ui/sonner/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { MEDIUM_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { shortcut } from "#lib/shortcut.ts";

  import { NoticeRegion } from "./notice-region.svelte";
  import type { Notices } from "./notices";
  import { setUndoShortcut, undoShortcutOn } from "./undo-shortcut";
  import WindowsInfoBars from "./WindowsInfoBars.svelte";

  type Side = "left" | "right";
  type Edge = "top" | "bottom";

  const PHONE_EDGE = {
    android: "bottom",
    ios: "top",
    linux: "bottom",
    macos: "bottom",
    windows: "bottom",
  } as const satisfies Record<Platform, Edge>;

  let {
    notices,
    platform,
    theme,
    top,
    bottom,
  }: {
    notices: Notices;
    platform: Platform;
    theme: Theme;
    top?: string;
    bottom?: string;
  } = $props();

  const phoneOffset = $derived({
    left: 0,
    right: 0,
    top:
      top ?? "calc(var(--spacing-safe-top) + var(--native-spacing-notice-top))",
    bottom: bottom ?? "var(--spacing-md)",
  });
  const cornerOffset = $derived({
    left: "var(--spacing-notice-end)",
    right: "var(--spacing-notice-end)",
    bottom: bottom ?? "var(--spacing-page-bottom)",
  });

  setUndoShortcut(untrack(() => undoShortcutOn(platform)));

  const endSide: Side = document.dir === "rtl" ? "left" : "right";
  const isWide = new MediaQuery(MEDIUM_QUERY);
  const isBannerFromTop = $derived(
    !isWide.current && PHONE_EDGE[platform] === "top",
  );
  const position: ToasterProps["position"] = $derived(
    isBannerFromTop ? "top-center" : (`bottom-${endSide}` as const),
  );
  const swipeDirections: ToasterProps["swipeDirections"] = $derived(
    isWide.current ? [endSide] : [PHONE_EDGE[platform]],
  );

  const region = new NoticeRegion(untrack(() => notices));
</script>

<svelte:window
  {@attach shortcut({
    key: "z",
    command: platform,
    shift: false,
    run: region.undoFromKeyboard,
  })}
  onpointerdown={region.forgetTapElsewhere}
/>

{#if platform === "windows"}
  <WindowsInfoBars {notices} {region} />
{:else}
  <div
    bind:this={region.element}
    role="presentation"
    onfocusin={region.noteFocusArriving}
    onfocusout={region.noteFocusLeaving}
    onclickcapture={region.returnFocusFromButton}
    onpointerdown={region.noteTap}
    onpointerenter={region.notePointerEntering}
    onpointerleave={region.notePointerLeaving}
  >
    <Toaster
      {theme}
      {position}
      {swipeDirections}
      expand={region.isSpread}
      offset={cornerOffset}
      mobileOffset={phoneOffset}
      containerAriaLabel={m.notice_region()}
      class={isBannerFromTop
        ? "medium:toast-list-width!"
        : "max-medium:absolute! medium:toast-list-width!"}
      toastOptions={{ class: "max-medium:px-native-notice-inline" }}
    />
  </div>
{/if}
