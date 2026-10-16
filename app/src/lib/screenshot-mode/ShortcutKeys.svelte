<script lang="ts">
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";

  import { type KeyCombination, keyNames } from "./key-combination";

  let {
    combination,
    platform,
  }: {
    readonly combination: KeyCombination;
    readonly platform: Platform;
  } = $props();
</script>

<span class="flex shrink-0 items-center gap-2xs">
  {#each keyNames(combination, platform) as name (name)}
    <Kbd class="px-sm py-2xs whitespace-nowrap">{name}</Kbd>
  {/each}
</span>
