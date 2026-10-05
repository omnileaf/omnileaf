<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  import { getScreenshotMode } from "./screenshot-mode.svelte";

  const screenshotMode = getScreenshotMode();

  let announcedIsOn = screenshotMode.isOn;
  let announcement = $state("");

  $effect(() => {
    const { isOn } = screenshotMode;
    if (isOn === announcedIsOn) {
      return;
    }
    announcedIsOn = isOn;
    announcement = isOn
      ? m.screenshot_mode_now_on()
      : m.screenshot_mode_now_off();
  });
</script>

<p aria-live="polite" class="sr-only">{announcement}</p>
