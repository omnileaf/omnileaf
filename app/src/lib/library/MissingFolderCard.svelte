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

  import { missingFolderCardOf } from "./missing-folder-card.ts";
  import type { MissingFolderActions } from "./missing-folder-notices.ts";
  import NativeMissingFolderCard from "./NativeMissingFolderCard.svelte";

  const TEXT_BUTTON =
    "border-0 bg-transparent px-md text-current text-native-notice-label/native-notice-label font-native-notice-label tracking-native-notice-label hover:bg-hover active:bg-pressed min-block-native-notice-action";

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

  const content = $derived(
    missingFolderCardOf({
      missing,
      isStillFailing,
      handlers,
      onHide,
      hidesLast: false,
    }),
  );
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
  <div role="status">
    <Alert tone="warning" icon={TriangleAlert} class="rounded-card">
      <AlertTitle>{content.title}</AlertTitle>
      <AlertDismiss
        label={m.notice_dismiss()}
        onDismiss={() => {
          onDismiss(missing);
        }}
      />
      <AlertDescription>{content.body}</AlertDescription>
      <AlertActions class="col-span-2 -ms-md">
        {#each content.actions as action (action.label)}
          <AlertButton emphasis="quiet" class={TEXT_BUTTON} onclick={action.run}
            >{action.label}</AlertButton
          >
        {/each}
      </AlertActions>
    </Alert>
  </div>
{/if}
