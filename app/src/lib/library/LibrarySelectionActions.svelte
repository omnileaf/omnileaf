<script lang="ts">
  import { Eye, Folder, Tag } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { LabelsFrom } from "./series-selection";

  const ICON_SIZE = 18;
  const PILL_ICON_SIZE = 16;

  let {
    count,
    isPill,
    keepsLabels,
    onLabels,
    onMarkRead,
    onCancel,
  }: {
    count: number;
    isPill: boolean;
    keepsLabels: boolean;
    onLabels: (from: LabelsFrom) => void;
    onMarkRead: () => void;
    onCancel: () => void;
  } = $props();

  const actions = $derived([
    ...(keepsLabels
      ? [
          {
            name: "categories",
            icon: Folder,
            label: m.library_categories(),
            act: () => {
              onLabels("categories");
            },
          },
          {
            name: "tags",
            icon: Tag,
            label: m.library_tags(),
            act: () => {
              onLabels("tags");
            },
          },
        ]
      : []),
    { name: "read", icon: Eye, label: m.library_mark_read(), act: onMarkRead },
  ]);
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
    {#each actions as { name, icon: Icon, label, act } (name)}
      <Button
        type="button"
        look="bar-icon"
        class="flex items-center gap-xs px-sm text-small font-medium block-pointer-target"
        onclick={act}
      >
        <Icon size={PILL_ICON_SIZE} aria-hidden="true" />
        {label}
      </Button>
    {/each}
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
    class="sticky inset-be-lg flex gap-2xs p-xs shadow-popover ios:max-medium:inset-be-none"
  >
    {#each actions as { name, icon: Icon, label, act } (name)}
      <Button
        type="button"
        look="bar-icon"
        class="flex-1 flex-col text-caption font-semibold min-block-selection-action"
        onclick={act}
      >
        <Icon size={ICON_SIZE} aria-hidden="true" />
        {label}
      </Button>
    {/each}
  </Card>
{/if}
