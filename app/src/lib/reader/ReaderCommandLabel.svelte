<script lang="ts">
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import { WINDOWS_COMMAND_LABEL } from "./windows-reader-bar.ts";

  let { label }: { label: string } = $props();

  const chrome = getReaderChrome();
</script>

{#if chrome.isCommandBar}
  <span class={WINDOWS_COMMAND_LABEL}>{label}</span>
{/if}
