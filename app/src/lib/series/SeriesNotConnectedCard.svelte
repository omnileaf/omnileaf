<script lang="ts">
  import { TriangleAlert } from "@lucide/svelte";

  import {
    Alert,
    AlertActions,
    AlertButton,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import { ALERT_TEXT_BUTTON } from "#lib/library/missing-folder-card.ts";
  import { m } from "#lib/paraglide/messages.js";

  let {
    title,
    onFind,
    onCheckAgain,
  }: { title: string; onFind: () => void; onCheckAgain: () => void } = $props();
</script>

<div role="status">
  <Alert
    tone="warning"
    icon={TriangleAlert}
    iconName="triangle-alert"
    class="rounded-card"
  >
    <AlertTitle>{m.series_not_connected_title({ title })}</AlertTitle>
    <AlertDescription>{m.series_not_connected_body()}</AlertDescription>
    <AlertActions class="col-span-2 -ms-md">
      <AlertButton emphasis="quiet" class={ALERT_TEXT_BUTTON} onclick={onFind}
        >{m.missing_find_folder()}</AlertButton
      >
      <AlertButton
        emphasis="quiet"
        class={ALERT_TEXT_BUTTON}
        onclick={onCheckAgain}>{m.series_check_again()}</AlertButton
      >
    </AlertActions>
  </Alert>
</div>
