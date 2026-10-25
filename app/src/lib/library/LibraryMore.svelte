<script lang="ts">
  import {
    Ellipsis,
    ListFilter,
    Pencil,
    Settings,
    SlidersHorizontal,
    SquareCheck,
    Tags,
  } from "@lucide/svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 20;
  const ITEM_ICON_SIZE = 16;

  interface FoldedChoices {
    readonly filtersCount: number;
    readonly onSortAndFilter: () => void;
    readonly onViewOptions: () => void;
  }

  let {
    keepsLabels,
    onSelect,
    folded,
    trigger = $bindable(null),
  }: {
    keepsLabels: boolean;
    onSelect: () => void;
    folded?: FoldedChoices | undefined;
    trigger?: HTMLElement | null;
  } = $props();

  function openLibrarySettings(): void {
    void goto(resolve("/(app)/settings/library"));
  }
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props: menuProps })}
      <Tooltip bind:ref={trigger} label={m.library_more()} {...menuProps}>
        {#snippet child({ props })}
          <Button
            {...props}
            look="header-control"
            aria-label={m.library_more()}
            class="block-native-target inline-native-target hover:tint-hover active:tint-pressed medium:block-touch-target medium:inline-touch-target large:block-touch-target desktop-shell:hidden"
          >
            <Ellipsis size={ICON_SIZE} aria-hidden="true" />
          </Button>
        {/snippet}
      </Tooltip>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent to="main" align="end">
    {#if folded !== undefined}
      <DropdownMenuItem onSelect={folded.onSortAndFilter}>
        <ListFilter size={ITEM_ICON_SIZE} aria-hidden="true" />
        {folded.filtersCount === 0
          ? m.library_filter_and_sort()
          : m.library_filter_and_sort_filtered({ count: folded.filtersCount })}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={folded.onViewOptions}>
        <SlidersHorizontal size={ITEM_ICON_SIZE} aria-hidden="true" />
        {m.library_view_options()}
      </DropdownMenuItem>
    {/if}
    <DropdownMenuItem {onSelect}>
      <SquareCheck size={ITEM_ICON_SIZE} aria-hidden="true" />
      {m.library_select_series()}
    </DropdownMenuItem>
    <DropdownMenuItem
      onSelect={() => {
        void goto(resolve("/(app)/settings/library/tabs"));
      }}
    >
      <Pencil size={ITEM_ICON_SIZE} aria-hidden="true" />
      {m.library_edit_categories()}
    </DropdownMenuItem>
    {#if keepsLabels}
      <DropdownMenuItem
        onSelect={() => {
          void goto(resolve("/(app)/settings/library/tags"));
        }}
      >
        <Tags size={ITEM_ICON_SIZE} aria-hidden="true" />
        {m.manage_tags_title()}
      </DropdownMenuItem>
    {/if}
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={openLibrarySettings}>
      <Settings size={ITEM_ICON_SIZE} aria-hidden="true" />
      {m.library_settings()}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
