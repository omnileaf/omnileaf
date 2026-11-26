<script lang="ts">
  import { Folder } from "@lucide/svelte";

  import { m } from "#lib/paraglide/messages.js";

  import { ABOUT_META } from "./series-about-layout.ts";

  let { folder }: { folder: string } = $props();
</script>

<p class={["flex items-center gap-icon-gap max-inline-full", ABOUT_META]}>
  <Folder
    role="img"
    aria-label={m.series_folder()}
    class="shrink-0 block-native-series-icon inline-native-series-icon"
  />
  <span class="truncate font-mono text-native-series-path/native-series-path">
    {folder}
  </span>
</p>
