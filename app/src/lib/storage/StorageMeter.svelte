<script lang="ts">
  import type { StorageUse } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { formatBytes } from "./bytes";

  const WHOLE = 100;

  let { used }: { used: StorageUse } = $props();

  function share(bytes: number): number {
    return used.totalBytes === 0 ? 0 : (bytes / used.totalBytes) * WHOLE;
  }

  const othersBytes = $derived(
    Math.max(0, used.totalBytes - used.freeBytes - used.omnileafBytes),
  );
</script>

<div
  role="meter"
  aria-label={m.storage_space_used()}
  aria-valuemin={0}
  aria-valuemax={WHOLE}
  aria-valuenow={Math.round(share(used.totalBytes - used.freeBytes))}
  aria-valuetext={m.storage_free_of_total({
    free: formatBytes(used.freeBytes),
    total: formatBytes(used.totalBytes),
  })}
  class="flex overflow-hidden rounded-full bg-chip block-md"
>
  <span class="bg-foreground" style:inline-size="{share(used.omnileafBytes)}%"
  ></span>
  <span class="bg-muted" style:inline-size="{share(othersBytes)}%"></span>
</div>
<ul class="flex flex-wrap items-center gap-x-md gap-y-2xs text-label">
  <li class="flex items-center gap-xs">
    <span
      aria-hidden="true"
      class="rounded-full bg-foreground block-sm inline-sm"
    ></span>
    {m.storage_omnileaf({ size: formatBytes(used.omnileafBytes) })}
  </li>
  <li class="flex items-center gap-xs">
    <span aria-hidden="true" class="rounded-full bg-muted block-sm inline-sm"
    ></span>
    {m.storage_everything_else()}
  </li>
  <li class="text-muted">
    {m.storage_free({ size: formatBytes(used.freeBytes) })}
  </li>
</ul>
