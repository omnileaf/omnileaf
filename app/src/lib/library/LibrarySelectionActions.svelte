<script lang="ts">
  import { Eye } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 18;
  const PILL_ICON_SIZE = 16;

  let {
    count,
    isPill,
    onMarkRead,
    onCancel,
  }: {
    count: number;
    isPill: boolean;
    onMarkRead: () => void;
    onCancel: () => void;
  } = $props();
</script>

{#if isPill}
  <Card
    role="group"
    aria-label={m.library_selection_toolbar()}
    class="sticky inset-be-lg flex items-center gap-2xs self-center p-xs shadow-popover"
  >
    <span
      class="me-xs rounded-control bg-accent-soft px-sm text-detail font-bold whitespace-nowrap"
    >
      {m.library_selected_series({ count })}
    </span>
    <Button
      type="button"
      look="bar-icon"
      class="flex items-center gap-xs px-sm text-small font-medium block-pointer-target"
      onclick={onMarkRead}
    >
      <Eye size={PILL_ICON_SIZE} aria-hidden="true" />
      {m.library_mark_read()}
    </Button>
    <span aria-hidden="true" class="mx-xs self-stretch border-s border-border"
    ></span>
    <Button
      type="button"
      look="bar-icon"
      aria-keyshortcuts="Escape"
      class="flex items-center gap-xs px-sm text-small font-medium block-pointer-target"
      onclick={onCancel}
    >
      {m.library_cancel()}
      <Kbd>{m.series_escape_key()}</Kbd>
    </Button>
  </Card>
{:else}
  <Card
    role="group"
    aria-label={m.library_selection_toolbar()}
    class="sticky inset-be-lg flex justify-center gap-2xs p-xs shadow-popover ios:max-medium:inset-be-none"
  >
    <Button
      type="button"
      look="bar-icon"
      class="flex-1 flex-col text-caption font-semibold min-block-selection-action"
      onclick={onMarkRead}
    >
      <Eye size={ICON_SIZE} aria-hidden="true" />
      {m.library_mark_read()}
    </Button>
  </Card>
{/if}
