<script lang="ts">
  import type { Platform } from "#lib/ipc/bindings.ts";

  import { screenshotModeShortcutOn } from "./shortcut";

  let { platform }: { readonly platform: Platform } = $props();

  const shortcut = $derived(screenshotModeShortcutOn(platform));
</script>

<kbd
  class="shrink-0 rounded-badge border border-border bg-chip px-sm py-2xs font-ui text-caption font-bold whitespace-nowrap"
>
  {shortcut.label()}
</kbd>
