<script lang="ts">
  import type { Platform } from "#lib/ipc/bindings.ts";

  import { WINDOWS_COMMAND_LABEL } from "./windows-reader-bar.ts";

  let { platform, label }: { platform: Platform; label: string } = $props();
</script>

{#if platform === "windows"}
  <span class={WINDOWS_COMMAND_LABEL}>{label}</span>
{/if}
