<script lang="ts">
  import { TriangleAlert } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type { FolderProblem, MissingFolder } from "#lib/ipc/bindings.ts";
  import type { ToastHandle } from "#lib/notices/notices.ts";
  import ToastCard, { TOAST_ICON_SIZE } from "#lib/notices/ToastCard.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import type { MissingFolderActions } from "./missing-folder-notices.ts";

  interface Wording {
    readonly title: string;
    readonly body: string;
  }

  const PRIMARY =
    "bg-on-warning px-lg text-detail text-warning-soft min-block-touch-target desktop:px-md desktop:min-block-compact-button";
  const SECONDARY =
    "rounded-full border border-warning-strong px-lg text-detail font-semibold min-block-touch-target desktop:px-md desktop:min-block-compact-button";

  let {
    missing,
    toast,
    handlers,
  }: {
    missing: MissingFolder;
    toast: ToastHandle;
    handlers: MissingFolderActions;
  } = $props();

  const { name, location } = $derived(missing.folder);
  const count = $derived(missing.hiddenSeries);
  const wording = $derived<Record<FolderProblem, Wording>>({
    missing: {
      title: m.missing_folder_title({ name }),
      body: m.missing_folder_body({ name, count }),
    },
    driveDisconnected: {
      title: m.missing_drive_title({ name }),
      body: m.missing_drive_body({ name, count }),
    },
    lostAccess: {
      title: m.missing_access_title({ name }),
      body: m.missing_access_body(),
    },
    needsSignIn: {
      title: m.missing_sign_in_title({ name }),
      body: m.missing_sign_in_body({ location }),
    },
  });
</script>

<ToastCard
  tone="warning"
  title={wording[missing.problem].title}
  body={wording[missing.problem].body}
  onDismiss={toast.dismiss}
>
  {#snippet icon()}
    <TriangleAlert size={TOAST_ICON_SIZE} class="text-warning-strong" />
  {/snippet}
  {#snippet actions()}
    {#if missing.problem === "lostAccess"}
      <Button
        type="button"
        look="inverse"
        class={PRIMARY}
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
    {:else if missing.problem === "needsSignIn"}
      <Button
        type="button"
        look="inverse"
        class={PRIMARY}
        onclick={() => {
          handlers.signIn(missing);
        }}
      >
        {m.missing_sign_in()}
      </Button>
    {:else}
      <Button
        type="button"
        look="inverse"
        class={PRIMARY}
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
