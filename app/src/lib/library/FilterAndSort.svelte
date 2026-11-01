<script lang="ts">
  import { ListFilter, X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { SheetBar } from "#lib/components/ui/drawer/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type {
    LibraryFilterChoices,
    LibraryListing,
  } from "#lib/ipc/bindings.ts";
  import { commandBarLook } from "#lib/page/command-bar-look.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { ANDROID_FILTER_SHEET } from "./filter-sheet-look";
  import FilterChoices from "./FilterChoices.svelte";
  import { filtersOn, NEW_LIBRARY_LISTING } from "./library-listing";
  import { type SheetScrollRules, scrollRulesOf } from "./sheet-scroll-rules";

  const ICON_SIZE = 16;
  const CLOSE_ICON_SIZE = 18;

  let {
    listing,
    choices,
    matching,
    docks,
    panelId,
    isOpen = $bindable(false),
    button = $bindable(null),
    onChoose,
    onOpen,
    showsButton = true,
    returnFocusTo = null,
  }: {
    listing: LibraryListing;
    choices: LibraryFilterChoices;
    matching: number | undefined;
    docks: boolean;
    panelId: string;
    isOpen?: boolean;
    button?: HTMLElement | null;
    onChoose: (listing: LibraryListing) => void;
    onOpen: () => void;
    showsButton?: boolean;
    returnFocusTo?: HTMLElement | null;
  } = $props();

  const titleId = $props.id();
  const showLabel = $derived(
    matching === undefined
      ? m.library_view_done()
      : m.library_show_series({ count: matching }),
  );
  const platform = currentPlatform();
  const width = new WindowWidth();
  const isIos = platform === "ios";
  const isMac = platform === "macos";
  const isAndroidPhone = $derived(
    phoneOf(platform, width.current) === "android",
  );
  let scrollRules = $state<SheetScrollRules>({ above: false, below: false });
  const bar = commandBarLook(platform);
  const filtersCount = $derived(filtersOn(listing.filter));
  const numbers = $derived(new Intl.NumberFormat(getLocale()));
  const buttonLabel = $derived(
    filtersCount === 0
      ? m.library_filter_and_sort()
      : m.library_filter_and_sort_filtered({ count: filtersCount }),
  );

  function toggle(): void {
    if (docks && isOpen) {
      isOpen = false;
      return;
    }
    isOpen = true;
    onOpen();
  }

  function close(): void {
    isOpen = false;
  }

  function followsScroll(body: HTMLElement): () => void {
    const follow = () => {
      scrollRules = scrollRulesOf(body);
    };
    const observer = new ResizeObserver(follow);
    observer.observe(body);
    for (const child of body.children) {
      observer.observe(child);
    }
    body.addEventListener("scroll", follow, { passive: true });
    follow();
    return () => {
      observer.disconnect();
      body.removeEventListener("scroll", follow);
    };
  }

  function focusButton(event: Event): void {
    event.preventDefault();
    (showsButton ? button : returnFocusTo)?.focus();
  }
</script>

{#if showsButton}
  <Tooltip
    bind:ref={button}
    label={buttonLabel}
    type="button"
    aria-haspopup={docks ? undefined : "dialog"}
    aria-controls={docks && isOpen ? panelId : undefined}
    aria-expanded={isOpen}
    aria-label={buttonLabel}
    onclick={toggle}
  >
    {#snippet child({ props })}
      <Button
        {...props}
        {...isMac
          ? {
              variant: "secondary",
              size: "large",
              iconOnly: true,
              label: buttonLabel,
            }
          : { look: bar?.look ?? "header-control" }}
        class={isMac
          ? [
              "rounded-native-button",
              filtersCount > 0 && "text-native-on-button-link",
            ]
          : bar === undefined
            ? [
                "relative block-native-target inline-native-target medium:block-touch-target medium:inline-touch-target large:ps-header-control-inline large:pe-md large:inline-auto",
                isOpen
                  ? "large:bg-accent-soft"
                  : "hover:tint-hover active:tint-pressed",
              ]
            : undefined}
      >
        <ListFilter
          size={ICON_SIZE}
          aria-hidden="true"
          class={bar?.icon ?? "large:block-lg large:inline-lg"}
        />
        {#if !isMac}
          <span class={bar?.label ?? "hidden large:inline"}>
            {m.library_filter()}
          </span>
        {/if}
        {#if filtersCount > 0 && !isMac}
          <span
            aria-hidden="true"
            class={[
              "absolute inset-e-2xs inset-bs-2xs flex items-center justify-center rounded-full border-2 border-background bg-accent px-2xs text-caption font-bold text-on-accent min-inline-filter-badge",
              bar === undefined && "large:hidden",
            ]}
          >
            {numbers.format(filtersCount)}
          </span>
          {#if bar === undefined}
            <span
              aria-hidden="true"
              class="hidden rounded-full bg-accent px-icon-gap text-center text-caption font-bold text-on-accent min-inline-filter-badge large:inline"
            >
              {numbers.format(filtersCount)}
            </span>
          {/if}
        {/if}
      </Button>
    {/snippet}
  </Tooltip>
{/if}

{#if !docks}
  <Dialog.Root bind:open={isOpen}>
    <ModalContent
      wideLook="sheet"
      wideClass="inline-filter-panel"
      phoneClass={isIos ? "" : "inset-bs-sheet-top block-auto"}
      phoneHeight={isIos ? "large" : "fit"}
      phoneGround={isIos ? "grouped" : "plain"}
      onDismiss={close}
      onCloseAutoFocus={focusButton}
    >
      {#snippet children(view)}
        {#if view === "wide"}
          <div
            class="flex items-center gap-md ps-filter-panel-inline pe-lg pbs-filter-panel-top pbe-filter-panel-title-gap"
          >
            <HeaderBadge
              icon={ListFilter}
              look="header-accent"
              class="windows:hidden"
            />
            <DialogTitle class="flex-1 text-panel-title font-bold">
              {m.library_filter_and_sort()}
            </DialogTitle>
            <Button
              type="button"
              look="text"
              class="rounded-badge px-sm text-detail block-panel-button"
              onclick={() => {
                onChoose(NEW_LIBRARY_LISTING);
              }}
            >
              {m.library_reset()}
            </Button>
            <Tooltip
              label={m.library_close()}
              aria-label={m.library_close()}
              onclick={close}
            >
              {#snippet child({ props })}
                <Button
                  {...props}
                  look="icon"
                  class="rounded-badge text-muted block-panel-button inline-panel-button"
                >
                  <X size={CLOSE_ICON_SIZE} aria-hidden="true" />
                </Button>
              {/snippet}
            </Tooltip>
          </div>
          <div
            class="flex flex-1 flex-col gap-filter-panel-gap overflow-y-auto px-filter-panel-inline pbs-xs pbe-md min-block-none"
          >
            <FilterChoices {listing} {choices} {onChoose} />
          </div>
          <div
            class="flex items-center border-bs border-border px-filter-panel-inline pbs-md pbe-lg"
          >
            <p role="status" class="flex-1 text-detail text-muted">
              {#if matching !== undefined}
                {m.library_series_match({ count: matching })}
              {/if}
            </p>
          </div>
        {:else}
          {#if isAndroidPhone}
            <div
              class={[
                ANDROID_FILTER_SHEET.header,
                scrollRules.above && ANDROID_FILTER_SHEET.rule,
              ]}
            >
              <DialogTitle id={titleId} class={ANDROID_FILTER_SHEET.title}>
                {m.library_filter_and_sort()}
              </DialogTitle>
              <Button
                type="button"
                variant="plain"
                onclick={() => {
                  onChoose(NEW_LIBRARY_LISTING);
                }}
              >
                {m.library_reset()}
              </Button>
            </div>
          {:else if isIos}
            <SheetBar
              title={m.library_filter_and_sort()}
              closeLabel={m.library_close()}
              actionLabel={m.library_reset()}
              onClose={close}
              onAction={() => {
                onChoose(NEW_LIBRARY_LISTING);
              }}
            />
          {:else}
            <div class="flex items-center gap-md px-sheet-inline pbs-md pbe-xs">
              <HeaderBadge icon={ListFilter} look="header-accent" />
              <DialogTitle id={titleId} class="flex-1 text-title font-bold">
                {m.library_filter_and_sort()}
              </DialogTitle>
              <Button
                type="button"
                look="text"
                class="px-xs text-body min-block-touch-target"
                onclick={() => {
                  onChoose(NEW_LIBRARY_LISTING);
                }}
              >
                {m.library_reset()}
              </Button>
            </div>
          {/if}
          <div
            {@attach followsScroll}
            data-sheet-body
            class={isAndroidPhone
              ? ANDROID_FILTER_SHEET.body
              : [
                  "flex flex-1 flex-col overflow-y-auto pbs-sm pbe-lg min-block-none",
                  isIos ? "gap-xl" : "px-sheet-inline",
                ]}
          >
            <FilterChoices {listing} {choices} {onChoose} isGrouped={isIos} />
          </div>
          <div
            class={isAndroidPhone
              ? [
                  ANDROID_FILTER_SHEET.foot,
                  scrollRules.below && ANDROID_FILTER_SHEET.rule,
                ]
              : isIos
                ? "px-lg pbs-sm pbe-sheet-bottom"
                : "border-bs border-border px-sheet-inline pbs-md pbe-sheet-bottom"}
          >
            <p role="status" class="sr-only">
              {#if matching !== undefined}
                {m.library_series_match({ count: matching })}
              {/if}
            </p>
            {#if isIos || isAndroidPhone}
              <Button
                type="button"
                variant="primary"
                size="large"
                class="inline-full"
                onclick={close}
              >
                {showLabel}
              </Button>
            {:else}
              <Button
                type="button"
                look="filled"
                class="rounded-control text-body font-semibold inline-full min-block-touch-target"
                onclick={close}
              >
                {showLabel}
              </Button>
            {/if}
          </div>
        {/if}
      {/snippet}
    </ModalContent>
  </Dialog.Root>
{/if}
