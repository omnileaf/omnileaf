<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  import { getScreenshotMode } from "./screenshot-mode.svelte";

  let { announcesTurningOn }: { announcesTurningOn: boolean } = $props();

  const screenshotMode = getScreenshotMode();

  let announcedIsOn = screenshotMode.isOn;
  let announcement = $state("");

  $effect(() => {
    const { isOn } = screenshotMode;
    if (isOn === announcedIsOn) {
      return;
    }
    announcedIsOn = isOn;
    if (!isOn) {
      announcement = m.screenshot_mode_now_off();
    } else if (announcesTurningOn) {
      announcement = m.screenshot_mode_now_on();
    } else {
      announcement = "";
    }
  });
</script>

<p aria-live="polite" class="sr-only">{announcement}</p>
