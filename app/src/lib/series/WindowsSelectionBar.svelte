<script lang="ts">
  import {
    BookmarkPlus,
    Ellipsis,
    Eye,
    EyeOff,
    Trash,
    X,
  } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { ReadMark } from "#lib/ipc/bindings.ts";
  import { commandBarLook } from "#lib/page/command-bar-look.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 20;
  const MENU_ICON_SIZE = 16;
  const bar = commandBarLook("windows");

  let {
    count,
    onMark,
    onBookmark,
    onDelete,
    onClear,
    element = $bindable(),
  }: {
    count: number;
    onMark: (mark: ReadMark) => void;
    onBookmark: () => void;
    onDelete: (() => void) | undefined;
    onClear: () => void;
    element?: HTMLElement | undefined;
  } = $props();
</script>

<div
  bind:this={element}
  role="group"
  aria-label={m.series_selection_toolbar()}
  class="flex items-center gap-sm"
>
  <p class="flex-1 text-body font-semibold" aria-live="polite">
    {m.series_selected_books({ count })}
  </p>
  <Button
    type="button"
    look="command"
    onclick={() => {
      onMark("read");
    }}
  >
    <Eye size={ICON_SIZE} aria-hidden="true" class={bar?.icon} />
    <span class={bar?.label}>{m.series_mark_read()}</span>
  </Button>
  <Button
    type="button"
    look="command"
    onclick={() => {
      onMark("unread");
    }}
  >
    <EyeOff size={ICON_SIZE} aria-hidden="true" class={bar?.icon} />
    <span class={bar?.label}>{m.series_mark_unread()}</span>
  </Button>
  <Button type="button" look="command" onclick={onBookmark}>
    <BookmarkPlus size={ICON_SIZE} aria-hidden="true" class={bar?.icon} />
    <span class={bar?.label}>{m.series_bookmark()}</span>
  </Button>
  {#if onDelete !== undefined}
    <DropdownMenu>
      <Tooltip label={m.series_selection_see_more()}>
        {#snippet child({ props: tip })}
          <DropdownMenuTrigger {...tip}>
            {#snippet child({ props })}
              <Button
                {...props}
                look="command"
                aria-label={m.series_selection_see_more()}
              >
                <Ellipsis
                  size={ICON_SIZE}
                  aria-hidden="true"
                  class={bar?.icon}
                />
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
        {/snippet}
      </Tooltip>
      <DropdownMenuContent to="main" align="end">
        <DropdownMenuItem onSelect={onDelete}>
          <Trash size={MENU_ICON_SIZE} aria-hidden="true" />
          {m.library_delete()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  {/if}
  <Tooltip
    label={m.series_clear_selection()}
    keys={[m.series_escape_key()]}
    type="button"
    aria-label={m.series_clear_selection_with_key({
      key: m.series_escape_key(),
    })}
    aria-keyshortcuts="Escape"
    onclick={onClear}
  >
    {#snippet child({ props })}
      <Button {...props} look="command">
        <X size={ICON_SIZE} aria-hidden="true" class={bar?.icon} />
      </Button>
    {/snippet}
  </Tooltip>
</div>
