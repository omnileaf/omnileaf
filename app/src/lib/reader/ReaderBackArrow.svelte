<script lang="ts">
  import { ChevronLeft } from "@lucide/svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";
  import { backIcon } from "#lib/page/top-bar.ts";

  import { READER_ICON_SIZE } from "./reader-bar.ts";
  import ReaderIcon from "./ReaderIcon.svelte";

  let { platform, isOnPhone }: { platform: Platform; isOnPhone: boolean } =
    $props();
</script>

<ReaderIcon
  name={backIcon(platform)}
  fallback={ChevronLeft}
  isKit={isOnPhone}
  size={READER_ICON_SIZE}
  class="shrink-0 rtl:-scale-x-100"
/>
