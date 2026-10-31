<script lang="ts">
  import { TriangleAlert } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type { MissingFolder } from "#lib/ipc/bindings.ts";
  import type { ToastHandle } from "#lib/notices/notices.ts";
  import { toastLook } from "#lib/notices/toast-look.ts";
  import ToastCard, { TOAST_ICON_SIZE } from "#lib/notices/ToastCard.svelte";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { MissingFolderActions } from "./missing-folder-notices.ts";
  import { remedyOf, wordingOf } from "./missing-folder-wording.ts";

  const SECONDARY =
    "rounded-full border border-warning-action-edge px-lg text-label font-medium min-block-touch-target android:medium:font-semibold desktop:rounded-toast-action desktop:px-sm desktop:text-caption desktop:block-xl desktop:min-block-xl";

  let {
    missing,
    isStillFailing,
    toast,
    handlers,
  }: {
    missing: MissingFolder;
    isStillFailing: boolean;
    toast: ToastHandle;
    handlers: MissingFolderActions;
  } = $props();

  const look = toastLook(currentPlatform());

  const remedy = $derived(remedyOf(missing));
  const wording = $derived(wordingOf(missing, isStillFailing));
</script>

<ToastCard
  tone="warning"
  title={wording.title}
  body={wording.body}
  onDismiss={toast.dismiss}
>
  {#snippet icon()}
    <TriangleAlert size={TOAST_ICON_SIZE} class="text-warning-strong" />
  {/snippet}
  {#snippet actions()}
    {#if remedy === "chooseAgain"}
      <Button
        type="button"
        look="inverse"
        class={look.warningAction}
        onclick={() => {
          handlers.find(missing);
        }}
      >
        {m.missing_choose_again()}
      </Button>
      <Button
        type="button"
        look="tinted"
        class={[SECONDARY, look.action]}
        onclick={() => {
          handlers.unlink(missing);
        }}
      >
        {m.missing_unlink()}
      </Button>
    {:else if remedy === "signIn"}
      <Button
        type="button"
        look="inverse"
        class={look.warningAction}
        onclick={() => {
          handlers.signIn(missing);
        }}
      >
        {isStillFailing ? m.missing_sign_in_again() : m.missing_sign_in()}
      </Button>
    {:else if remedy === "tryAgain"}
      <Button
        type="button"
        look="inverse"
        class={look.warningAction}
        onclick={() => {
          handlers.tryAgain(missing);
        }}
      >
        {m.missing_try_again()}
      </Button>
    {:else}
      <Button
        type="button"
        look="inverse"
        class={look.warningAction}
        onclick={() => {
          handlers.showAnyway(missing);
        }}
      >
        {m.missing_show_anyway()}
      </Button>
      <Button
        type="button"
        look="tinted"
        class={[SECONDARY, look.action]}
        onclick={() => {
          handlers.find(missing);
        }}
      >
        {m.missing_find_folder()}
      </Button>
    {/if}
  {/snippet}
</ToastCard>
