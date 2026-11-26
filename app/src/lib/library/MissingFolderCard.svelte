<script lang="ts">
  import { TriangleAlert } from "@lucide/svelte";

  import {
    Alert,
    AlertActions,
    AlertButton,
    AlertDescription,
    AlertDismiss,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import type { MissingFolder } from "#lib/ipc/bindings.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    ALERT_TEXT_BUTTON,
    missingFolderCardOf,
  } from "./missing-folder-card.ts";
  import type { MissingFolderActions } from "./missing-folder-notices.ts";
  import NativeMissingFolderCard from "./NativeMissingFolderCard.svelte";

  let {
    missing,
    isStillFailing,
    handlers,
    onHide,
    onDismiss,
  }: {
    missing: MissingFolder;
    isStillFailing: boolean;
    handlers: MissingFolderActions;
    onHide: (missing: MissingFolder) => void;
    onDismiss: (missing: MissingFolder) => void;
  } = $props();
</script>

{#if currentPlatform() === "ios"}
  <NativeMissingFolderCard
    {missing}
    {isStillFailing}
    {handlers}
    {onHide}
    {onDismiss}
  />
{:else}
  {@const content = missingFolderCardOf({
    missing,
    isStillFailing,
    handlers,
    onHide,
  })}
  <div role="status">
    <Alert
      tone="warning"
      icon={TriangleAlert}
      iconName="triangle-alert"
      class="rounded-card"
    >
      <AlertTitle>{content.title}</AlertTitle>
      <AlertDismiss
        label={m.notice_dismiss()}
        onDismiss={() => {
          onDismiss(missing);
        }}
      />
      <AlertDescription>{content.body}</AlertDescription>
      <AlertActions class="col-span-2 -ms-md">
        {#each content.actions as action, index (index)}
          <AlertButton
            emphasis="quiet"
            class={ALERT_TEXT_BUTTON}
            onclick={action.run}
          >
            {action.label}
          </AlertButton>
        {/each}
      </AlertActions>
    </Alert>
  </div>
{/if}
