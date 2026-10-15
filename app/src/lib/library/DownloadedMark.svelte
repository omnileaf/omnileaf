<script lang="ts">
  import { Download } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { m } from "#lib/paraglide/messages.js";

  const MARK_ICON_SIZE = 12;

  let { class: className }: { class?: ClassValue } = $props();
</script>

<span
  role="img"
  aria-label={m.library_downloaded_chapters()}
  class={[
    "flex items-center justify-center rounded-full bg-accent text-on-accent block-downloaded-mark inline-downloaded-mark",
    className,
  ]}
>
  <Download size={MARK_ICON_SIZE} aria-hidden="true" />
</span>
