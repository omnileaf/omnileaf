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
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { IosPhone } from "./ios-phone.svelte.ts";

  const ICON_SIZE = 20;
  const IOS_BAR_ICON_SIZE = 22;
  const ITEM_ICON_SIZE = 16;
  const platform = currentPlatform();
  const width = new WindowWidth();
  const ios = new IosPhone();

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
            class="block-native-target inline-native-target hover:tint-hover active:tint-pressed medium:block-touch-target medium:inline-touch-target large:block-touch-target ios:medium:block-native-target ios:medium:inline-native-target desktop-shell:hidden"
          >
            {#if phoneOf(platform, width.current) === "android"}
              <Icon name="ellipsis" />
            {:else}
              <Ellipsis
                size={ios.isOn ? IOS_BAR_ICON_SIZE : ICON_SIZE}
                aria-hidden="true"
              />
            {/if}
          </Button>
        {/snippet}
      </Tooltip>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent to="main" align="end">
    {#if folded !== undefined}
      <DropdownMenuItem onSelect={folded.onSortAndFilter}>
        {#if platform === "android"}
          <Icon name="list-filter" size={ITEM_ICON_SIZE} />
        {:else}
          <ListFilter size={ITEM_ICON_SIZE} aria-hidden="true" />
        {/if}
        {folded.filtersCount === 0
          ? m.library_filter_and_sort()
          : m.library_filter_and_sort_filtered({ count: folded.filtersCount })}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={folded.onViewOptions}>
        {#if platform === "android"}
          <Icon name="sliders-horizontal" size={ITEM_ICON_SIZE} />
        {:else}
          <SlidersHorizontal size={ITEM_ICON_SIZE} aria-hidden="true" />
        {/if}
        {m.library_view_options()}
      </DropdownMenuItem>
    {/if}
    <DropdownMenuItem {onSelect}>
      {#if platform === "android"}
        <Icon name="square-check" size={ITEM_ICON_SIZE} />
      {:else}
        <SquareCheck size={ITEM_ICON_SIZE} aria-hidden="true" />
      {/if}
      {m.library_select_series()}
    </DropdownMenuItem>
    <DropdownMenuItem
      onSelect={() => {
        void goto(resolve("/(app)/settings/library/tabs"));
      }}
    >
      {#if platform === "android"}
        <Icon name="pencil" size={ITEM_ICON_SIZE} />
      {:else}
        <Pencil size={ITEM_ICON_SIZE} aria-hidden="true" />
      {/if}
      {m.library_edit_categories()}
    </DropdownMenuItem>
    {#if keepsLabels}
      <DropdownMenuItem
        onSelect={() => {
          void goto(resolve("/(app)/settings/library/tags"));
        }}
      >
        {#if platform === "android"}
          <Icon name="tags" size={ITEM_ICON_SIZE} />
        {:else}
          <Tags size={ITEM_ICON_SIZE} aria-hidden="true" />
        {/if}
        {m.manage_tags_title()}
      </DropdownMenuItem>
    {/if}
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={openLibrarySettings}>
      {#if platform === "android"}
        <Icon name="settings" size={ITEM_ICON_SIZE} />
      {:else}
        <Settings size={ITEM_ICON_SIZE} aria-hidden="true" />
      {/if}
      {m.library_settings()}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
