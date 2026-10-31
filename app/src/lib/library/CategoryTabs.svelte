<script lang="ts">
  import { ChevronDown, Pencil, Plus } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { flushSync } from "svelte";
  import { SvelteSet } from "svelte/reactivity";

  import { goto } from "$app/navigation";
  import { getAnimationsSetting } from "#lib/appearance/animations.svelte.ts";
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent, SheetBar } from "#lib/components/ui/drawer/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import LibraryGlyph from "#lib/navigation/LibraryGlyph.svelte";
  import { phoneAction } from "#lib/page/action-group.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import CategoryGlyph from "./CategoryGlyph.svelte";
  import { categoryTabsLook } from "./category-tabs-look.ts";
  import { type ArrangedTab, tabKey } from "./library-tabs.ts";

  interface Tab {
    readonly id: string;
    readonly name: string;
  }

  const ICON_SIZE = 16;
  const SHEET_ICON_SIZE = 18;
  const SETTINGS_ROUTE = "/(app)/settings/library/tabs";

  let {
    arranged,
    chosen,
    onChoose,
  }: {
    arranged: readonly ArrangedTab[];
    chosen: string;
    onChoose: (tab: string) => void;
  } = $props();

  const platform = currentPlatform();
  const animations = getAnimationsSetting();
  const width = new WindowWidth();
  const isWide = $derived(width.current !== "compact");
  const onPhone = $derived(isPhone(platform, width.current));
  const look = $derived(categoryTabsLook(platform, width.current));
  const editPhone = $derived(phoneAction(platform, width.current, "other"));
  const newPhone = $derived.by(() => {
    const action = phoneAction(platform, width.current, "main");
    const { newVariant } = look.sheet;
    return action === undefined || newVariant === undefined
      ? action
      : { ...action, variant: newVariant };
  });
  const tabs = $derived<readonly Tab[]>(
    arranged.map(({ id, name }) => ({ id: tabKey(id), name })),
  );

  let strip = $state<HTMLElement | null>(null);
  const hidden = new SvelteSet<string>();
  let isSheetOpen = $state(false);
  const titleId = $props.id();

  const tucked = $derived(tabs.filter(({ id }) => hidden.has(id)));

  $effect(() => {
    const root = strip;
    if (root === null) {
      return;
    }
    measureTabs(root);
    const buttons = tabs.flatMap(({ id }) => buttonOf(root, id) ?? []);
    const watching = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          markHidden(entry.target, entry.intersectionRatio < 1);
        }
      },
      { root, threshold: 1 },
    );
    for (const button of buttons) {
      watching.observe(button);
    }
    return () => {
      watching.disconnect();
    };
  });

  function buttonOf(root: HTMLElement, id: string): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-tab="${CSS.escape(id)}"]`);
  }

  function measureTabs(root: HTMLElement): void {
    const shown = root.getBoundingClientRect();
    hidden.clear();
    for (const button of root.querySelectorAll("[data-tab]")) {
      const box = button.getBoundingClientRect();
      markHidden(button, box.left < shown.left || box.right > shown.right);
    }
  }

  function markHidden(tab: Element, isHidden: boolean): void {
    const id = (tab as HTMLElement).dataset.tab;
    if (id === undefined) {
      return;
    }
    if (isHidden) {
      hidden.add(id);
    } else {
      hidden.delete(id);
    }
  }

  let followedTab: string | undefined;

  $effect(() => {
    const tab = strip === null ? null : buttonOf(strip, chosen);
    if (strip === null || tab === null) {
      return;
    }
    const isFirst = followedTab === undefined;
    const isChange = !isFirst && followedTab !== chosen;
    followedTab = chosen;
    if (onPhone) {
      strip.scrollBy({
        left: stepToCentre(strip, tab),
        behavior:
          isChange && animations.moves("navigation") ? "smooth" : "auto",
      });
    } else if (isFirst) {
      strip.scrollBy({ left: stepIntoView(strip, tab) });
      measureTabs(strip);
    } else if (isChange) {
      tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  });

  function stepToCentre(within: HTMLElement, tab: HTMLElement): number {
    const shown = within.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    return box.left + box.width / 2 - (shown.left + shown.width / 2);
  }

  /** Browsers snap a scroll offset to whole pixels, so the step rounds outward to leave no fraction of the tab past the edge. */
  function stepIntoView(within: HTMLElement, tab: HTMLElement): number {
    const shown = within.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    if (box.left < shown.left) {
      return Math.floor(box.left - shown.left);
    }
    return Math.max(0, Math.ceil(box.right - shown.right));
  }

  function moveWithArrows(event: KeyboardEvent): void {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const isRightToLeft =
      getComputedStyle(event.currentTarget as Element).direction === "rtl";
    const at = tabs.findIndex(({ id }) => id === chosen);
    const next =
      tabs[(at + (isRightToLeft ? -step : step) + tabs.length) % tabs.length];
    if (next !== undefined) {
      onChoose(next.id);
      flushSync();
      if (strip !== null) {
        buttonOf(strip, next.id)?.focus({ preventScroll: true });
      }
    }
  }

  function openSettings(): void {
    isSheetOpen = false;
    void goto(resolve(SETTINGS_ROUTE));
  }
</script>

<div class={look.row}>
  <div
    bind:this={strip}
    role="tablist"
    tabindex="-1"
    aria-label={m.library_categories()}
    onkeydown={moveWithArrows}
    class={[
      "isolate flex flex-1 scrollbar-none overflow-x-auto min-inline-none medium:overflow-x-hidden",
      look.strip,
    ]}
  >
    {#each tabs as tab (tab.id)}
      {@const isChosen = tab.id === chosen}
      <button
        type="button"
        role="tab"
        data-tab={tab.id}
        aria-selected={isChosen}
        tabindex={isChosen ? 0 : -1}
        onclick={() => {
          onChoose(tab.id);
        }}
        class={[
          look.tab,
          isChosen ? look.chosenTab : look.otherTab,
          hidden.has(tab.id) && !isChosen && "medium:invisible",
        ]}
      >
        {tab.name}
      </button>
    {/each}
  </div>
  {#if isWide}
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            look="bar-icon"
            class="shrink-0 gap-sm px-md text-small font-medium min-block-pointer-button"
          >
            {m.library_categories_more()}
            <ChevronDown size={ICON_SIZE} aria-hidden="true" />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent to="main" align="end" class="min-inline-book-menu">
        {#if tucked.length > 0}
          <p class="px-sm py-xs text-small font-semibold">
            {m.library_more_categories()}
          </p>
          <DropdownMenuRadioGroup value={chosen} onValueChange={onChoose}>
            {#each tucked as tab (tab.id)}
              <DropdownMenuRadioItem value={tab.id}>
                {tab.name}
              </DropdownMenuRadioItem>
            {/each}
          </DropdownMenuRadioGroup>
          <hr class="-mx-xs my-xs border-border" />
        {/if}
        <DropdownMenuItem onSelect={openSettings}>
          <Pencil size={ICON_SIZE} aria-hidden="true" />
          {m.library_categories_edit()}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openSettings}>
          <Plus size={ICON_SIZE} aria-hidden="true" />
          {m.library_category_new()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  {:else}
    <Button
      type="button"
      look="icon"
      aria-label={m.library_categories_every()}
      aria-haspopup="dialog"
      aria-expanded={isSheetOpen}
      class={look.arrow}
      onclick={() => {
        isSheetOpen = true;
      }}
    >
      <span class={look.arrowFace}>
        <CategoryGlyph
          name="chevron-down"
          isMaterial={look.usesMaterialIcons}
        />
      </span>
    </Button>
    <Dialog.Root bind:open={isSheetOpen}>
      <DrawerContent
        onDismiss={() => {
          isSheetOpen = false;
        }}
        height={look.sheet.height}
        ground={look.sheet.ground}
        aria-labelledby={titleId}
      >
        {#if look.sheet.isBarred}
          <SheetBar
            title={m.library_categories()}
            {titleId}
            description={m.library_categories_every_description()}
            closeLabel={m.library_close()}
            actionLabel={m.library_categories_edit_short()}
            onClose={() => {
              isSheetOpen = false;
            }}
            onAction={openSettings}
          />
        {:else}
          <div class={look.sheet.header}>
            {#if look.sheet.hasBadge}
              <span
                aria-hidden="true"
                class="flex shrink-0 items-center justify-center rounded-full bg-chip block-reader-dense inline-reader-dense"
              >
                <LibraryGlyph size={SHEET_ICON_SIZE} />
              </span>
            {/if}
            <div class="flex flex-col">
              <DialogTitle id={titleId} class={look.sheet.title}>
                {m.library_categories()}
              </DialogTitle>
              <Dialog.Description class={look.sheet.description}>
                {m.library_categories_every_description()}
              </Dialog.Description>
            </div>
          </div>
        {/if}
        <div
          role="radiogroup"
          aria-labelledby={titleId}
          class={look.sheet.list}
        >
          {#each tabs as tab (tab.id)}
            {@const isChosen = tab.id === chosen}
            <button
              type="button"
              role="radio"
              aria-checked={isChosen}
              class={look.sheet.option}
              onclick={() => {
                onChoose(tab.id);
                isSheetOpen = false;
              }}
            >
              <span data-slot="item-title" class="flex-1">{tab.name}</span>
              {#if isChosen}
                <span class={look.sheet.check}>
                  <CategoryGlyph
                    name="check"
                    isMaterial={look.usesMaterialIcons}
                  />
                </span>
              {/if}
            </button>
          {/each}
        </div>
        <div class={look.sheet.foot}>
          {#if !look.sheet.isBarred}
            <Button
              type="button"
              {...editPhone === undefined
                ? { look: "outline" }
                : { variant: editPhone.variant, size: editPhone.size }}
              class={[
                "flex flex-1 items-center justify-center gap-sm",
                editPhone === undefined
                  ? "rounded-full text-body min-block-touch-target"
                  : editPhone.fit,
              ]}
              onclick={openSettings}
            >
              <CategoryGlyph
                name="pencil"
                isMaterial={look.usesMaterialIcons}
              />
              {m.library_categories_edit_short()}
            </Button>
          {/if}
          <Button
            type="button"
            {...newPhone === undefined
              ? { look: "tinted" }
              : { variant: newPhone.variant, size: newPhone.size }}
            class={[
              "flex flex-1 items-center justify-center gap-sm",
              newPhone === undefined
                ? "rounded-full bg-chip text-body font-semibold min-block-touch-target"
                : newPhone.fit,
            ]}
            onclick={openSettings}
          >
            <CategoryGlyph name="plus" isMaterial={look.usesMaterialIcons} />
            {m.library_category_new()}
          </Button>
        </div>
      </DrawerContent>
    </Dialog.Root>
  {/if}
</div>
