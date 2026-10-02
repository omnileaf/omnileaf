<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";
  import SettingsLinks from "$lib/settings/SettingsLinks.svelte";

  const screenshotMode = getScreenshotMode();
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.privacy_title()}</h1>
<SettingsLinks
  links={[
    {
      route: "/settings/privacy/screenshot-mode",
      label: m.screenshot_mode_title(),
      value: screenshotMode.isOn ? m.switch_on() : m.switch_off(),
    },
  ]}
/>
