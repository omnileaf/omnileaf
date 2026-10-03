<script lang="ts">
  import type { Snippet } from "svelte";

  import {
    setThemeSetting,
    themeSettingForDocument,
  } from "$lib/appearance/theme.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import "../app.css";

  let { children }: { children: Snippet } = $props();

  setThemeSetting(themeSettingForDocument());
</script>

<svelte:head>
  <title>{m.app_name()}</title>
</svelte:head>

{@render children()}
