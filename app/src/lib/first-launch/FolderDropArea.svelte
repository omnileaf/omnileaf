<script lang="ts">
  import { FolderPlus } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import AddFolderButton from "#lib/library/AddFolderButton.svelte";
  import type { FolderAdding } from "#lib/library/folder-adding.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { folderNameOf } from "./folder-drops.svelte";

  const ICON_SIZE = 28;

  let {
    adding,
    dragged,
    hint,
  }: {
    adding: FolderAdding;
    dragged: readonly string[];
    hint: Snippet;
  } = $props();

  const isOver = $derived(dragged.length > 0);
  const title = $derived.by(() => {
    const [first, ...others] = dragged;
    if (first === undefined) {
      return m.first_launch_drop_title();
    }
    return others.length === 0
      ? m.first_launch_drop_to_link({ name: folderNameOf(first) })
      : m.first_launch_drop_to_link_many({ count: dragged.length });
  });
</script>

<div
  role="group"
  aria-label={m.first_launch_drop_title()}
  class={[
    "flex flex-col items-center justify-center gap-sm rounded-card border-2 p-xl text-center min-block-drop-area",
    isOver
      ? "border-solid border-accent bg-accent/8"
      : "border-dashed border-border",
  ]}
>
  <FolderPlus size={ICON_SIZE} aria-hidden="true" class="text-muted" />
  <p class="font-semibold" aria-live="polite">{title}</p>
  <p class={["text-footnote", isOver ? "text-foreground" : "text-muted"]}>
    {@render hint()}
  </p>
  <AddFolderButton {adding} placement="drop-area" />
</div>
