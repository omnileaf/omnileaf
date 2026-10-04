<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";
  import SettingsLinks from "$lib/settings/SettingsLinks.svelte";

  const screenshotMode = getScreenshotMode();
</script>

<SectionHeading title={m.privacy_title()} />
<SettingsLinks
  links={[
    {
      route: "/settings/privacy/screenshot-mode",
      label: m.screenshot_mode_title(),
      value: screenshotMode.isOn ? m.switch_on() : m.switch_off(),
    },
  ]}
/>
