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
  import { m } from "#lib/paraglide/messages.js";

  import type { MissingFolderActions } from "./missing-folder-notices.ts";
  import { remedyOf, wordingOf } from "./missing-folder-wording.ts";

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

  const remedy = $derived(remedyOf(missing));
  const wording = $derived(wordingOf(missing, isStillFailing));
  const isShown = $derived(missing.isShownAnyway && remedy === "showOrFind");
  const body = $derived(
    isShown
      ? m.missing_shown_body({ count: missing.hiddenSeries })
      : wording.body,
  );
</script>

<div role="status">
  <Alert tone="warning" icon={TriangleAlert} class="rounded-card">
    <AlertTitle>{wording.title}</AlertTitle>
    <AlertDismiss
      label={m.notice_dismiss()}
      onDismiss={() => {
        onDismiss(missing);
      }}
    />
    <AlertDescription>{body}</AlertDescription>
    <AlertActions class="col-span-2 -ms-md">
      {#if remedy === "chooseAgain"}
        <AlertButton
          emphasis="quiet"
          class={TEXT_BUTTON}
          onclick={() => {
            handlers.find(missing);
          }}>{m.missing_choose_again()}</AlertButton
        >
        <AlertButton
          emphasis="quiet"
          class={TEXT_BUTTON}
          onclick={() => {
            handlers.unlink(missing);
          }}>{m.missing_unlink()}</AlertButton
        >
      {:else if remedy === "signIn"}
        <AlertButton
          emphasis="quiet"
          class={TEXT_BUTTON}
          onclick={() => {
            handlers.signIn(missing);
          }}
          >{isStillFailing
            ? m.missing_sign_in_again()
            : m.missing_sign_in()}</AlertButton
        >
      {:else if remedy === "tryAgain"}
        <AlertButton
          emphasis="quiet"
          class={TEXT_BUTTON}
          onclick={() => {
            handlers.tryAgain(missing);
          }}>{m.missing_try_again()}</AlertButton
        >
      {:else}
        <AlertButton
          emphasis="quiet"
          class={TEXT_BUTTON}
          onclick={() => {
            if (isShown) {
              onHide(missing);
            } else {
              handlers.showAnyway(missing);
            }
          }}
          >{isShown
            ? m.missing_hide_again()
            : m.missing_show_anyway()}</AlertButton
        >
        <AlertButton
          emphasis="quiet"
          class={TEXT_BUTTON}
          onclick={() => {
            handlers.find(missing);
          }}>{m.missing_find_folder()}</AlertButton
        >
      {/if}
    </AlertActions>
  </Alert>
</div>
