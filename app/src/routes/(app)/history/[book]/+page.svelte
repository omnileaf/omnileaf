<script lang="ts">
  import { ChevronLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import ReadingSessions from "#lib/history/ReadingSessions.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";

  import type { PageProps } from "./$types";

  const BACK_ICON_SIZE = 20;

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
</script>

<div class="flex flex-col gap-lg touch:max-medium:px-xs">
  <header class="flex items-center gap-xs">
    <a
      href={resolve("/(app)/history")}
      data-back-link
      aria-label={m.history_back()}
      class="flex shrink-0 items-center justify-center rounded-full transition-control block-touch-target inline-touch-target hover:bg-hover active:bg-pressed"
    >
      <ChevronLeft size={BACK_ICON_SIZE} aria-hidden="true" />
    </a>
    <h1 tabindex="-1" class="truncate text-panel-title font-bold">
      {m.history_reading_sessions()}
    </h1>
  </header>
  {#key data.book}
    <ReadingSessions book={data.book} usesStandIns={screenshotMode.isOn} />
  {/key}
</div>
