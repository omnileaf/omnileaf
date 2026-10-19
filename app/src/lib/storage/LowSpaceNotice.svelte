<script lang="ts">
  import { untrack } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { getNotices, type Notice } from "#lib/notices/notices.ts";

  import type { DeviceWord } from "./device";
  import { lowSpaceNotice } from "./low-space-notice";
  import type { StorageCheck } from "./storage-check.svelte";

  let { storage, device }: { storage: StorageCheck; device: DeviceWord } =
    $props();

  const notices = getNotices();
  let shown: Notice | undefined;

  $effect(() => {
    const used = storage.use;
    const isLow = used?.isLow === true;
    untrack(() => {
      if (!isLow && shown !== undefined) {
        notices.withdraw(shown);
        shown = undefined;
      }
      if (isLow && shown === undefined) {
        shown = lowSpaceNotice(used.freeBytes, device, () => {
          void goto(resolve("/(app)/settings/storage"));
        });
        notices.show(shown);
      }
    });
  });
</script>
