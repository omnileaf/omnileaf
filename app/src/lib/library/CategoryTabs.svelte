<script lang="ts">
  import { Check, ChevronDown, Pencil, Plus } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { flushSync } from "svelte";
  import { MediaQuery, SvelteSet } from "svelte/reactivity";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent } from "#lib/components/ui/drawer/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import type { LibraryCategory } from "#lib/ipc/bindings.ts";
  import LibraryGlyph from "#lib/navigation/LibraryGlyph.svelte";
  import { MEDIUM_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { ALL_SERIES } from "./library-tab.svelte.ts";

  interface Tab {
    readonly id: string;
    readonly name: string;
  }

  const ICON_SIZE = 16;
  const SHEET_ICON_SIZE = 18;
  const SETTINGS_ROUTE = "/(app)/settings/library";

  let {
    categories,
    chosen,
    onChoose,
  }: {
    categories: readonly LibraryCategory[];
    chosen: string;
    onChoose: (tab: string) => void;
  } = $props();

  const isWide = new MediaQuery(MEDIUM_QUERY);
  const tabs = $derived<readonly Tab[]>([
    { id: ALL_SERIES, name: m.library_category_all() },
    ...categories,
  ]);

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
    const watching = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.tab;
          if (id === undefined) {
            continue;
          }
          if (entry.intersectionRatio < 1) {
            hidden.add(id);
          } else {
            hidden.delete(id);
          }
        }
      },
      { root, threshold: 1 },
    );
    for (const tab of root.querySelectorAll("[data-tab]")) {
      watching.observe(tab);
    }
    return () => {
      watching.disconnect();
    };
  });

  function choose(tab: string): void {
    onChoose(tab);
    flushSync();
    strip
      ?.querySelector(`[data-tab="${CSS.escape(tab)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
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
      choose(next.id);
      strip
        ?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next.id)}"]`)
        ?.focus();
    }
  }

  function openSettings(): void {
    isSheetOpen = false;
    void goto(resolve(SETTINGS_ROUTE));
  }
</script>

<div
  class="-ms-gutter -me-page-end flex items-center gap-xs border-be border-border ps-gutter pe-page-end max-medium:-ms-page-start max-medium:ps-page-start in-toolbar:ps-lg"
>
  <div
    bind:this={strip}
    role="tablist"
    tabindex="-1"
    aria-label={m.library_categories()}
    onkeydown={moveWithArrows}
    class="flex flex-1 scrollbar-none overflow-x-auto min-inline-none medium:overflow-x-hidden"
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
          choose(tab.id);
        }}
        class={[
          "relative shrink-0 px-md text-small whitespace-nowrap transition-control min-block-touch-target after:absolute after:inset-x-sm after:inset-be-none after:rounded-full after:block-2xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent expanded:min-block-pointer-button",
          isChosen
            ? "font-semibold text-foreground after:bg-foreground"
            : "font-medium text-muted hover:text-foreground",
          hidden.has(tab.id) && !isChosen && "medium:invisible",
        ]}
      >
        {tab.name}
      </button>
    {/each}
  </div>
  {#if isWide.current}
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            look="bar-icon"
            class="shrink-0 gap-xs px-sm text-small font-medium min-block-pointer-button"
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
          <DropdownMenuRadioGroup value={chosen} onValueChange={choose}>
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
      class="shrink-0 block-touch-target inline-touch-target hover:bg-hover active:bg-pressed"
      onclick={() => {
        isSheetOpen = true;
      }}
    >
      <ChevronDown size={SHEET_ICON_SIZE} aria-hidden="true" />
    </Button>
    <Dialog.Root bind:open={isSheetOpen}>
      <DrawerContent
        onDismiss={() => {
          isSheetOpen = false;
        }}
        aria-labelledby={titleId}
      >
        <div class="flex items-center gap-md px-sheet-inline pbs-sheet-gap">
          <span
            aria-hidden="true"
            class="flex shrink-0 items-center justify-center rounded-full bg-chip block-reader-dense inline-reader-dense"
          >
            <LibraryGlyph size={SHEET_ICON_SIZE} />
          </span>
          <div class="flex flex-col">
            <DialogTitle id={titleId} class="text-title font-bold">
              {m.library_categories()}
            </DialogTitle>
            <Dialog.Description class="text-small text-muted">
              {m.library_categories_every_description()}
            </Dialog.Description>
          </div>
        </div>
        <div
          role="radiogroup"
          aria-labelledby={titleId}
          class="flex flex-col overflow-auto px-sm pbs-sm min-block-none"
        >
          {#each tabs as tab (tab.id)}
            {@const isChosen = tab.id === chosen}
            <button
              type="button"
              role="radio"
              aria-checked={isChosen}
              class="flex items-center gap-md rounded-control px-md text-start text-body transition-control min-block-touch-target hover:bg-hover active:bg-pressed"
              onclick={() => {
                choose(tab.id);
                isSheetOpen = false;
              }}
            >
              <span class="flex-1">{tab.name}</span>
              {#if isChosen}
                <Check size={ICON_SIZE} aria-hidden="true" />
              {/if}
            </button>
          {/each}
        </div>
        <div class="flex gap-sm px-sheet-inline pbs-md pbe-sheet-bottom">
          <Button
            type="button"
            look="outline"
            class="flex flex-1 items-center justify-center gap-sm rounded-full text-body min-block-touch-target"
            onclick={openSettings}
          >
            <Pencil size={ICON_SIZE} aria-hidden="true" />
            {m.library_categories_edit_short()}
          </Button>
          <Button
            type="button"
            look="tinted"
            class="flex flex-1 items-center justify-center gap-sm rounded-full bg-chip text-body font-semibold min-block-touch-target"
            onclick={openSettings}
          >
            <Plus size={ICON_SIZE} aria-hidden="true" />
            {m.library_category_new()}
          </Button>
        </div>
      </DrawerContent>
    </Dialog.Root>
  {/if}
</div>
