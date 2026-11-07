<script lang="ts">
  import ThemeChoice from "./ThemeChoice.svelte";
  import { setThemeSetting, themeSettingForDocument } from "./theme.svelte.ts";

  let { title }: { title: string } = $props();

  setThemeSetting(themeSettingForDocument());
</script>

<ThemeChoice {title} />
