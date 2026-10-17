<script lang="ts">
  import { Folder } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import type { NetworkShare, Platform } from "#lib/ipc/bindings.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { lastShown } from "#lib/page/last-shown.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  interface ShareToChoose {
    readonly name: string;
    readonly share: NetworkShare;
  }

  interface PickerWording {
    readonly lead: string;
    readonly signIn: string;
    readonly choose: string;
  }

  const SHARE_SEPARATOR = "/";

  let {
    choosing,
    platform,
    onContinue,
    onClose,
  }: {
    choosing: ShareToChoose | undefined;
    platform: Platform;
    onContinue: () => void;
    onClose: () => void;
  } = $props();

  const shown = lastShown(() => choosing);
  const server = $derived(shown.current?.share.server ?? "");
  const folder = $derived(
    shown.current?.share.name.split(SHARE_SEPARATOR).at(-1) ?? "",
  );
  const picker = $derived<PickerWording>(
    platform === "ios"
      ? {
          lead: m.missing_choose_again_ios_lead(),
          signIn: m.missing_choose_again_ios_sign_in({ server }),
          choose: m.missing_choose_again_ios_choose(),
        }
      : {
          lead: m.missing_choose_again_android_lead(),
          signIn: m.missing_choose_again_android_sign_in({ server }),
          choose: m.missing_choose_again_android_choose(),
        },
  );
  const steps = $derived([
    picker.signIn,
    m.missing_choose_again_open({ server, folder }),
    picker.choose,
  ]);
</script>

<Dialog.Root
  bind:open={
    () => choosing !== undefined,
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
      }
    }
  }
>
  <ModalContent
    wideClass="inset-none m-auto flex flex-col gap-lg overflow-hidden rounded-panel border border-dialog-edge bg-card px-sheet-inline py-sheet-inline text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit"
    phoneClass="gap-lg px-sheet-inline pbs-md pbe-sheet-bottom max-block-dialog-limit"
    onDismiss={onClose}
  >
    <div class="flex items-center gap-md">
      <HeaderBadge icon={Folder} look="header-accent" />
      <div class="flex flex-col gap-2xs min-inline-none">
        <DialogTitle class="text-body font-semibold">
          {m.missing_choose_again_title({ name: shown.current?.name ?? "" })}
        </DialogTitle>
        <Dialog.Description class="text-label text-muted">
          {picker.lead}
        </Dialog.Description>
      </div>
    </div>
    <ol class="flex flex-col gap-md text-callout">
      {#each steps as step, index (index)}
        <li class="flex items-start gap-md">
          <span
            aria-hidden="true"
            class="flex shrink-0 items-center justify-center rounded-full bg-chip text-detail font-semibold block-xl inline-xl"
          >
            {index + 1}
          </span>
          <span>{step}</span>
        </li>
      {/each}
    </ol>
    <div class="flex flex-col gap-sm">
      <Button
        type="button"
        look="primary"
        class="flex items-center justify-center px-xl font-bold min-block-touch-button ios:rounded-ios-button android:rounded-full desktop:rounded-button desktop:text-label desktop:min-block-pointer-target"
        onclick={onContinue}
      >
        {m.missing_continue()}
      </Button>
      <Button
        type="button"
        look="quiet"
        class="flex items-center justify-center px-xl min-block-touch-target ios:rounded-ios-button android:rounded-full desktop:rounded-button desktop:text-label desktop:min-block-pointer-target"
        onclick={onClose}
      >
        {m.missing_not_now()}
      </Button>
    </div>
  </ModalContent>
</Dialog.Root>
