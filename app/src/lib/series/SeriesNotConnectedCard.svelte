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
    body,
    onFind,
    onCheckAgain,
  }: {
    title: string;
    body: string;
    onFind: () => void;
    onCheckAgain?: (() => void) | undefined;
  } = $props();
</script>

<Alert
  tone="warning"
  icon={TriangleAlert}
  iconName="triangle-alert"
  class="rounded-card"
>
  <AlertTitle>{title}</AlertTitle>
  <AlertDescription>{body}</AlertDescription>
  <AlertActions class="col-span-2 -ms-md">
    <AlertButton emphasis="quiet" class={ALERT_TEXT_BUTTON} onclick={onFind}>
      {m.missing_find_folder()}
    </AlertButton>
    {#if onCheckAgain !== undefined}
      <AlertButton
        emphasis="quiet"
        class={ALERT_TEXT_BUTTON}
        onclick={onCheckAgain}
      >
        {m.series_check_again()}
      </AlertButton>
    {/if}
  </AlertActions>
</Alert>
