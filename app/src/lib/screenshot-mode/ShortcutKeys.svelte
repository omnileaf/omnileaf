<script lang="ts">
  import { Kbd, WINDOWS_PLAIN_KEY } from "#lib/components/ui/kbd/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";

  import { type KeyCombination, shownKeys } from "./key-combination";

  const KEY = `px-sm py-2xs whitespace-nowrap ${WINDOWS_PLAIN_KEY} windows:bg-transparent windows:text-label windows:text-native-on-surface`;

  let {
    combination,
    platform,
  }: {
    readonly combination: KeyCombination;
    readonly platform: Platform;
  } = $props();
</script>

<span class="flex shrink-0 items-center gap-2xs">
  {#each shownKeys(combination, platform) as name (name)}
    <Kbd class={KEY}>{name}</Kbd>
  {/each}
</span>
