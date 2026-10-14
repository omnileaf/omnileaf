<script lang="ts">
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";

  import { screenshotModeShortcutLabel } from "./shortcut";

  let { platform }: { readonly platform: Platform } = $props();
</script>

<Kbd class="px-sm py-2xs whitespace-nowrap">
  {screenshotModeShortcutLabel(platform)}
</Kbd>
