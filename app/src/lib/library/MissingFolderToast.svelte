<script lang="ts">
  import { TriangleAlert } from "@lucide/svelte";

  import { assertNever } from "#lib/assert-never.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import type { FolderProblem, MissingFolder } from "#lib/ipc/bindings.ts";
  import type { ToastHandle } from "#lib/notices/notices.ts";
  import ToastCard, {
    TOAST_ICON_SIZE,
    WARNING_ACTION,
  } from "#lib/notices/ToastCard.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import type { MissingFolderActions } from "./missing-folder-notices.ts";

  interface Wording {
    readonly title: string;
    readonly body: string;
  }

  type Remedy = "showOrFind" | "chooseAgain" | "signIn" | "tryAgain";

  const REMEDIES = {
    missing: "showOrFind",
    driveDisconnected: "showOrFind",
    lostAccess: "chooseAgain",
    needsSignIn: "signIn",
    needsMounting: "tryAgain",
    shareUnreachable: "chooseAgain",
  } as const satisfies Record<FolderProblem["kind"], Remedy>;

  const SECONDARY =
    "rounded-full border border-warning-strong px-lg text-detail font-semibold min-block-touch-target desktop:px-md desktop:min-block-compact-button";

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

  const { name } = $derived(missing.folder);
  const count = $derived(missing.hiddenSeries);
  const remedy = $derived<Remedy>(REMEDIES[missing.problem.kind]);
  const wording = $derived.by<Wording>(() => {
    const { problem } = missing;
    switch (problem.kind) {
      case "missing":
        return {
          title: m.missing_folder_title({ name }),
          body: m.missing_folder_body({ name, count }),
        };
      case "driveDisconnected":
        return {
          title: m.missing_drive_title({ name }),
          body: m.missing_drive_body({ name, count }),
        };
      case "lostAccess":
        return {
          title: m.missing_access_title({ name }),
          body: m.missing_access_body(),
        };
      case "needsSignIn":
        return isStillFailing
          ? {
              title: m.missing_sign_in_failed_title({ name }),
              body: m.missing_sign_in_failed_body({
                share: problem.share.name,
              }),
            }
          : {
              title: m.missing_sign_in_title({ name }),
              body: m.missing_sign_in_body({ share: problem.share.name }),
            };
      case "needsMounting":
        return {
          title: m.missing_mount_title({ name }),
          body: m.missing_mount_body({ share: problem.share.name }),
        };
      case "shareUnreachable":
        return isStillFailing
          ? {
              title: m.missing_share_failed_title({ name }),
              body: m.missing_share_failed_body({
                share: problem.share.name,
                server: problem.share.server,
              }),
            }
          : {
              title: m.missing_access_title({ name }),
              body: m.missing_share_body({ server: problem.share.server }),
            };
      default:
        return assertNever(problem);
    }
  });
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
        class={WARNING_ACTION}
        onclick={() => {
          handlers.find(missing);
        }}
      >
        {m.missing_choose_again()}
      </Button>
      <Button
        type="button"
        look="tinted"
        class={SECONDARY}
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
        class={WARNING_ACTION}
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
        class={WARNING_ACTION}
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
        class={WARNING_ACTION}
        onclick={() => {
          handlers.showAnyway(missing);
        }}
      >
        {m.missing_show_anyway()}
      </Button>
      <Button
        type="button"
        look="tinted"
        class={SECONDARY}
        onclick={() => {
          handlers.find(missing);
        }}
      >
        {m.missing_find_folder()}
      </Button>
    {/if}
  {/snippet}
</ToastCard>
