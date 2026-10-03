<script lang="ts">
  import { onMount, type Snippet } from "svelte";

  import {
    setThemeSetting,
    themeSettingForDocument,
  } from "$lib/appearance/theme.svelte";
  import { rescanEveryFolder } from "$lib/library/rescan-folder";
  import { m } from "$lib/paraglide/messages.js";

  import "../app.css";

  let { children }: { children: Snippet } = $props();

  setThemeSetting(themeSettingForDocument());

  onMount(() => {
    void rescanEveryFolder();
  });
</script>

<svelte:head>
  <title>{m.app_name()}</title>
</svelte:head>

{@render children()}
