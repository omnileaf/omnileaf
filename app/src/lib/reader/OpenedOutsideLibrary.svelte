<script lang="ts">
  import { FolderSearch } from "@lucide/svelte";

  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { openedFromLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  let { platform }: { platform: Platform } = $props();
</script>

<Alert
  tone="plain"
  icon={FolderSearch}
  role="status"
  class="pointer-events-auto fixed inset-x-none inset-bs-none z-notice m-md"
>
  <AlertTitle class="text-small font-semibold">
    {openedFromLabel(platform)}
  </AlertTitle>
  <AlertDescription class="text-small text-muted">
    {m.reader_opened_outside_library_body()}
  </AlertDescription>
</Alert>
