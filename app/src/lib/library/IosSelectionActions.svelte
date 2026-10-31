<script lang="ts">
  import { Portal } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { LabelsFrom } from "./series-selection";

  let {
    keepsLabels,
    onLabels,
    onMarkRead,
    onDelete,
  }: {
    keepsLabels: boolean;
    onLabels: (from: LabelsFrom) => void;
    onMarkRead: () => void;
    onDelete: () => void;
  } = $props();

  const actions = $derived([
    ...(keepsLabels
      ? [
          {
            name: "categories",
            label: m.library_categories(),
            act: () => {
              onLabels("categories");
            },
          },
          {
            name: "tags",
            label: m.library_tags(),
            act: () => {
              onLabels("tags");
            },
          },
        ]
      : []),
    { name: "read", label: m.library_mark_read(), act: onMarkRead },
    { name: "delete", label: m.library_delete(), act: onDelete },
  ]);
</script>

<Portal>
  <div
    role="group"
    aria-label={m.library_selection_toolbar()}
    class="fixed inset-x-lg inset-be-floating-gap z-tab-bar flex items-center justify-between"
  >
    {#each actions as { name, label, act } (name)}
      <Button
        type="button"
        look="header-control"
        class="px-md whitespace-nowrap text-foreground block-native-toolbar-button inline-auto min-inline-native-target"
        onclick={act}
      >
        {label}
      </Button>
    {/each}
  </div>
</Portal>
