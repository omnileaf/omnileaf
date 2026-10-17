<script lang="ts">
  import {
    Ellipsis,
    Pencil,
    Settings,
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

  let {
    keepsLabels,
    onSelect,
  }: { keepsLabels: boolean; onSelect: () => void } = $props();

  function openLibrarySettings(): void {
    void goto(resolve("/(app)/settings/library"));
  }
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props: menuProps })}
      <Tooltip label={m.library_more()} {...menuProps}>
        {#snippet child({ props })}
          <Button
            {...props}
            look="header-control"
            aria-label={m.library_more()}
            class="block-touch-target inline-touch-target hover:tint-hover active:tint-pressed desktop-shell:hidden"
          >
            <Ellipsis size={ICON_SIZE} aria-hidden="true" />
          </Button>
        {/snippet}
      </Tooltip>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent to="main" align="end">
    <DropdownMenuItem {onSelect}>
      <SquareCheck size={ITEM_ICON_SIZE} aria-hidden="true" />
      {m.library_select_series()}
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={openLibrarySettings}>
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
