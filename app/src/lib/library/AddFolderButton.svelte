<script lang="ts">
  import { Plus } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { m } from "$lib/paraglide/messages.js";

  import type { FolderAdding } from "./folder-adding.svelte";
  import { ICON_SIZE } from "./icon-size";

  type Look = "filled" | "outlined" | "plain";

  const LOOKS = {
    filled: "rounded-control bg-accent px-lg text-on-accent",
    outlined: "rounded-control border border-border bg-card px-lg",
    plain: "rounded-full px-md text-accent",
  } satisfies Record<Look, ClassValue>;

  let {
    adding,
    look,
    class: className,
  }: { adding: FolderAdding; look: Look; class?: ClassValue } = $props();
</script>

<button
  type="button"
  class={[
    "flex items-center justify-center gap-sm font-semibold min-block-touch-target disabled:opacity-60",
    LOOKS[look],
    className,
  ]}
  disabled={adding.isBusy}
  onclick={() => {
    void adding.add();
  }}
>
  <Plus size={ICON_SIZE} aria-hidden="true" />
  {m.library_add_folder()}
</button>
