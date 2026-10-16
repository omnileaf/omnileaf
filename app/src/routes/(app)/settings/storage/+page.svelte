<script lang="ts">
  import { onMount } from "svelte";

  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { isPhone, isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import { formatBytes } from "#lib/storage/bytes.ts";
  import CacheRow from "#lib/storage/CacheRow.svelte";
  import { getStorageCheck } from "#lib/storage/storage-check.svelte.ts";
  import StorageMeter from "#lib/storage/StorageMeter.svelte";

  import type { PageProps } from "./$types";

  const CARD =
    "rounded-card border border-border bg-card android:rounded-android-md android:border-transparent android:bg-android-container-low";

  let { data }: PageProps = $props();

  const storage = getStorageCheck();
  const width = new WindowWidth();
  const meterHeadingId = $props.id();

  const deviceName = $derived.by(() => {
    if (isPointer(data.appInfo.platform)) {
      return m.storage_on_this_computer();
    }
    return isPhone(data.appInfo.platform, width.current)
      ? m.storage_on_this_phone()
      : m.storage_on_this_tablet();
  });

  onMount(() => {
    void storage.check();
  });
</script>

<SectionHeading title={m.storage_title()} />
{#if storage.use !== undefined}
  <div class="mbs-pane-gap flex flex-col gap-pane-gap">
    <section
      aria-labelledby={meterHeadingId}
      class={["flex flex-col gap-sm p-lg", CARD]}
    >
      <h2 id={meterHeadingId} class="text-label font-semibold">
        {deviceName}
      </h2>
      <StorageMeter used={storage.use} />
    </section>
    <section class={["flex flex-col overflow-hidden", CARD]}>
      <div class="flex flex-col divide-y divide-border">
        <CacheRow
          title={m.storage_cached_pages()}
          detail={m.storage_cached_pages_size({
            size: formatBytes(storage.use.cachedPagesBytes),
          })}
          isClearing={storage.clearing !== undefined}
          onClear={() => {
            void storage.clear("cachedPages");
          }}
        />
        <CacheRow
          title={m.storage_covers()}
          detail={formatBytes(storage.use.coversBytes)}
          isClearing={storage.clearing !== undefined}
          onClear={() => {
            void storage.clear("covers");
          }}
        />
      </div>
      <p class="px-lg pbe-md text-detail text-muted max-inline-prose">
        {m.storage_runs_low()}
      </p>
    </section>
  </div>
{/if}
