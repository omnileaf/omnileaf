<script lang="ts">
  import type { Platform } from "#lib/ipc/bindings.ts";

  import ChooseShareAgainSheet from "./ChooseShareAgainSheet.svelte";
  import type { FolderFinder } from "./folder-finder.svelte";

  let { finder, platform }: { finder: FolderFinder; platform: Platform } =
    $props();
</script>

<ChooseShareAgainSheet
  choosing={finder.shareToChoose}
  {platform}
  onContinue={() => {
    finder.continueChoosing();
  }}
  onClose={() => {
    finder.stopChoosing();
  }}
/>
