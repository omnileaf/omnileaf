<script lang="ts">
  import { SlidersHorizontal } from "@lucide/svelte";
  import { Dialog, Popover } from "bits-ui";
  import { MediaQuery } from "svelte/reactivity";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent, SheetBar } from "#lib/components/ui/drawer/index.ts";
  import { PopoverContent } from "#lib/components/ui/popover/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { LibraryView } from "#lib/ipc/bindings.ts";
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import { MEDIUM_QUERY, WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { commandBarLook } from "#lib/page/command-bar-look.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { ANDROID_FILTER_SHEET } from "./filter-sheet-look";
  import ViewChoices from "./ViewChoices.svelte";
  import { viewPanelWidth } from "./view-panel";

  const ICON_SIZE = 16;

  let {
    view,
    coversDrawn,
    mostThatFit,
    hasCategories,
    onChoose,
    isOpen = $bindable(false),
    button = $bindable(null),
    showsButton = true,
    returnFocusTo = null,
  }: {
    view: LibraryView;
    coversDrawn: number | undefined;
    mostThatFit: number | undefined;
    hasCategories: boolean;
    onChoose: (view: LibraryView) => void;
    isOpen?: boolean;
    button?: HTMLElement | null;
    showsButton?: boolean;
    returnFocusTo?: HTMLElement | null;
  } = $props();

  const isWide = new MediaQuery(MEDIUM_QUERY);
  const titleId = $props.id();
  const platform = currentPlatform();
  const isIos = platform === "ios";
  const width = new WindowWidth();
  const isAndroidPhone = $derived(
    phoneOf(platform, width.current) === "android",
  );
  const bar = commandBarLook(platform);
  const isMac = platform === "macos";
  const panelWidth = viewPanelWidth(platform);

  let direction: "ltr" | "rtl" = $state("ltr");

  function open(): void {
    if (button !== null) {
      direction = getComputedStyle(button).direction === "rtl" ? "rtl" : "ltr";
    }
    isOpen = true;
  }

  function close(): void {
    isOpen = false;
  }

  function focusButton(event: Event): void {
    event.preventDefault();
    (showsButton ? button : returnFocusTo)?.focus();
  }
</script>

{#if showsButton}
  <Tooltip
    bind:ref={button}
    label={m.library_view_options()}
    type="button"
    aria-haspopup="dialog"
    aria-expanded={isOpen}
    aria-label={m.library_view_options()}
    onclick={open}
  >
    {#snippet child({ props })}
      <Button
        {...props}
        {...isMac
          ? {
              variant: "secondary",
              size: "large",
              iconOnly: true,
              label: m.library_view_options(),
            }
          : { look: bar?.look ?? "header-control" }}
        class={isMac
          ? "rounded-native-button"
          : bar === undefined
            ? [
                "block-native-target inline-native-target medium:block-touch-target medium:inline-touch-target large:px-header-control-inline large:inline-auto",
                isOpen
                  ? "large:bg-accent-soft"
                  : "hover:tint-hover active:tint-pressed",
              ]
            : undefined}
      >
        <SlidersHorizontal
          size={ICON_SIZE}
          aria-hidden="true"
          class={bar?.icon ?? "large:block-lg large:inline-lg"}
        />
        {#if !isMac}
          <span class={bar?.label ?? "hidden large:inline"}>
            {m.library_view()}
          </span>
        {/if}
      </Button>
    {/snippet}
  </Tooltip>
{/if}

{#if isWide.current}
  <Popover.Root bind:open={isOpen}>
    <PopoverContent
      customAnchor={button}
      dir={direction}
      align="end"
      aria-labelledby={titleId}
      class={[
        "flex flex-col gap-md overflow-auto px-panel-inline pbs-lg pbe-panel-inline max-block-full",
        panelWidth,
      ]}
      onCloseAutoFocus={focusButton}
    >
      <h2 id={titleId} class="text-panel-title font-bold">
        {m.library_view_options()}
      </h2>
      <ViewChoices
        {view}
        {coversDrawn}
        {mostThatFit}
        {hasCategories}
        {onChoose}
      />
    </PopoverContent>
  </Popover.Root>
{:else}
  <Dialog.Root bind:open={isOpen}>
    <DrawerContent
      height={isIos ? "large" : "fit"}
      ground={isIos ? "grouped" : "plain"}
      onDismiss={close}
      onCloseAutoFocus={focusButton}
    >
      {#if isIos}
        <SheetBar
          title={m.library_view_options()}
          closeLabel={m.library_close()}
          onClose={close}
        />
      {:else if isAndroidPhone}
        <div class={ANDROID_FILTER_SHEET.header}>
          <DialogTitle class={ANDROID_FILTER_SHEET.title}>
            {m.library_view_options()}
          </DialogTitle>
        </div>
        <Dialog.Description
          class="{ROW_SUBTITLE_TYPE} ps-lg pe-lg pbe-sm text-muted"
        >
          {m.library_view_kept_phone()}
        </Dialog.Description>
      {:else}
        <div class="flex items-center gap-md px-sheet-inline pbs-sheet-gap">
          <span
            aria-hidden="true"
            class="flex shrink-0 items-center justify-center rounded-full bg-chip block-reader-dense inline-reader-dense"
          >
            <SlidersHorizontal size={ICON_SIZE} />
          </span>
          <div class="flex flex-1 flex-col">
            <DialogTitle class="text-title font-bold">
              {m.library_view_options()}
            </DialogTitle>
            <Dialog.Description class="text-small text-muted">
              {m.library_view_kept_phone()}
            </Dialog.Description>
          </div>
          <Button
            type="button"
            look="quiet"
            class="rounded-control px-xs text-body min-block-touch-target"
            onclick={close}
          >
            {m.library_view_done()}
          </Button>
        </div>
      {/if}
      <div
        class={isAndroidPhone
          ? "flex flex-col overflow-auto pbe-native-sheet-foot-bottom min-block-none"
          : [
              "flex flex-col overflow-auto pbs-sheet-gap pbe-sheet-bottom min-block-none",
              isIos ? "gap-xl" : "px-sheet-inline",
            ]}
      >
        <ViewChoices
          {view}
          {coversDrawn}
          {mostThatFit}
          {hasCategories}
          {onChoose}
          isGrouped={isIos}
        />
      </div>
    </DrawerContent>
  </Dialog.Root>
{/if}
