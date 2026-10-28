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
    "flex flex-col items-center justify-center gap-sm rounded-card border-2 p-xl text-center min-block-drop-area windows:rounded-windows-layer windows:min-block-none",
    isOver
      ? "border-solid border-accent bg-accent/8 windows:border-2 windows:border-windows-accent windows:bg-native-menu-chosen windows:text-native-on-menu-chosen"
      : "border-dashed border-border windows:border windows:border-windows-stroke-strong windows:bg-windows-subtle",
  ]}
>
  <FolderPlus
    size={ICON_SIZE}
    aria-hidden="true"
    class={[
      "text-muted",
      isOver
        ? "windows:text-native-on-menu-chosen"
        : "windows:text-windows-accent",
    ]}
  />
  <p
    class="font-semibold windows:text-label windows:text-inherit"
    aria-live="polite"
  >
    {title}
  </p>
  <p
    class={[
      "text-footnote windows:text-caption",
      isOver ? "text-foreground windows:text-inherit" : "text-muted",
    ]}
  >
    {@render hint()}
  </p>
  <AddFolderButton {adding} placement="drop-area" />
</div>
