<script lang="ts">
  import { Eye, EyeOff, X } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { ReadMark } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 16;
  const MARKS = [
    { mark: "read", icon: Eye, label: m.series_mark_read },
    { mark: "unread", icon: EyeOff, label: m.series_mark_unread },
  ] as const;

  let {
    count,
    onMark,
    onClear,
  }: {
    count: number;
    onMark: (mark: ReadMark) => void;
    onClear: () => void;
  } = $props();
</script>

<Card
  role="group"
  aria-label={m.series_selection_toolbar()}
  class="sticky inset-be-lg flex items-center gap-2xs self-center p-xs shadow-popover"
>
  <span
    class="me-xs rounded-control bg-accent-soft px-sm text-detail font-bold whitespace-nowrap"
  >
    {m.series_selected_books({ count })}
  </span>
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
</Card>
