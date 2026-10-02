<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { m } from "$lib/paraglide/messages.js";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";

  const CHEVRON_SIZE = 20;

  const screenshotMode = getScreenshotMode();
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.privacy_title()}</h1>
<ul
  class="mbs-xl divide-y divide-border rounded-card border border-border bg-card"
>
  <li>
    <a
      href={resolve("/settings/privacy/screenshot-mode")}
      class="flex items-center gap-sm px-lg min-block-touch-target"
    >
      <span class="flex-1">{m.screenshot_mode_title()}</span>
      <span class="text-muted">
        {screenshotMode.isOn ? m.switch_on() : m.switch_off()}
      </span>
      <ChevronRight size={CHEVRON_SIZE} class="text-muted rtl:-scale-x-100" />
    </a>
  </li>
</ul>
