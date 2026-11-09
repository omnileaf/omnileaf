<script lang="ts">
  import type { StorageUse } from "#lib/ipc/bindings.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { formatBytes } from "./bytes";

  const WHOLE = 100;

  let { used }: { used: StorageUse } = $props();

  function share(bytes: number): number {
    return used.totalBytes === 0 ? 0 : (bytes / used.totalBytes) * WHOLE;
  }

  const android = new AndroidPhone();

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
  class={[
    "flex overflow-hidden rounded-full",
    android.isOn ? "gap-xs block-sm" : "bg-chip block-md",
  ]}
>
  <span
    class={android.isOn ? "rounded-full bg-accent" : "bg-foreground"}
    style:inline-size="{share(used.omnileafBytes)}%"
  ></span>
  <span
    class={["bg-muted", android.isOn && "rounded-full"]}
    style:inline-size="{share(othersBytes)}%"
  ></span>
  {#if android.isOn}
    <span class="flex-1 rounded-full bg-chip"></span>
  {/if}
</div>
<ul
  class={[
    "flex flex-wrap items-center",
    android.isOn
      ? "gap-x-lg gap-y-sm text-native-row-subtitle/native-row-subtitle text-muted"
      : "gap-x-md gap-y-2xs text-label",
  ]}
>
  <li class={["flex items-center", android.isOn ? "gap-sm" : "gap-xs"]}>
    <span
      aria-hidden="true"
      class={[
        "rounded-full block-sm inline-sm",
        android.isOn ? "bg-accent" : "bg-foreground",
      ]}
    ></span>
    {m.storage_omnileaf({ size: formatBytes(used.omnileafBytes) })}
  </li>
  <li class={["flex items-center", android.isOn ? "gap-sm" : "gap-xs"]}>
    <span aria-hidden="true" class="rounded-full bg-muted block-sm inline-sm"
    ></span>
    {m.storage_everything_else()}
  </li>
  <li class={["text-muted", android.isOn && "flex items-center gap-sm"]}>
    {#if android.isOn}
      <span
        aria-hidden="true"
        class="rounded-full border border-border bg-chip block-sm inline-sm"
      ></span>
    {/if}
    {m.storage_free({ size: formatBytes(used.freeBytes) })}
  </li>
</ul>
