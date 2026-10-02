<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";
  import SettingsLinks, {
    type SettingsLink,
  } from "$lib/settings/SettingsLinks.svelte";

  const SETTINGS_PAGES: readonly SettingsLink[] = [
    { route: "/settings/library", label: m.library_title() },
    { route: "/settings/appearance", label: m.appearance_title() },
    { route: "/settings/general", label: m.general_title() },
    { route: "/settings/about", label: m.about_title() },
  ];
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.settings_title()}</h1>
<SettingsLinks links={SETTINGS_PAGES} />
