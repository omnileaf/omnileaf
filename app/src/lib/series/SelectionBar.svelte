<script lang="ts">
  import { BookmarkPlus, Eye, EyeOff, X } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { ReadMark } from "#lib/ipc/bindings.ts";
  import SelectionToolbar from "#lib/page/SelectionToolbar.svelte";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 16;
  const MARKS = [
    { mark: "read", icon: Eye, label: m.series_mark_read },
    { mark: "unread", icon: EyeOff, label: m.series_mark_unread },
  ] as const;

  let {
    count,
    onMark,
    onBookmark,
    onClear,
  }: {
    count: number;
    onMark: (mark: ReadMark) => void;
    onBookmark?: () => void;
    onClear: () => void;
  } = $props();
</script>

<SelectionToolbar
  label={m.series_selection_toolbar()}
  count={m.series_selected_books({ count })}
>
  {#each MARKS as { mark, icon: Icon, label } (mark)}
    <Tooltip
      label={label()}
      type="button"
      aria-label={label()}
      onclick={() => {
        onMark(mark);
      }}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look="bar-icon"
          class="block-pointer-target inline-pointer-target"
        >
          <Icon size={ICON_SIZE} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
  {/each}
  {#if onBookmark !== undefined}
    <Tooltip
      label={m.series_bookmark()}
      type="button"
      aria-label={m.series_bookmark()}
      onclick={onBookmark}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look="bar-icon"
          class="block-pointer-target inline-pointer-target"
        >
          <BookmarkPlus size={ICON_SIZE} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
  {/if}
  <span aria-hidden="true" class="mx-xs self-stretch border-s border-border"
  ></span>
  <Tooltip
    label={m.series_clear_selection()}
    type="button"
    aria-label={m.series_clear_selection_with_key({
      key: m.series_escape_key(),
    })}
    aria-keyshortcuts="Escape"
    onclick={onClear}
  >
    {#snippet child({ props })}
      <Button
        {...props}
        look="bar-icon"
        class="px-sm text-muted block-pointer-target"
      >
        <Kbd>{m.series_escape_key()}</Kbd>
        <X size={ICON_SIZE} aria-hidden="true" />
      </Button>
    {/snippet}
  </Tooltip>
</SelectionToolbar>
