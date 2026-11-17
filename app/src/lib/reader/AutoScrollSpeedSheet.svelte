<script lang="ts">
  import { Dialog } from "bits-ui";

  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent } from "#lib/components/ui/drawer/index.ts";
  import { takeBackWithinScreen } from "#lib/navigation/back-within-screen.ts";
  import { m } from "#lib/paraglide/messages.js";

  import AutoScrollSpeedSetting from "./AutoScrollSpeedSetting.svelte";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import type { ReaderSettings } from "./reader-settings.svelte.ts";
  import { readingSettingsContentLook } from "./reading-settings-content-look.ts";
  import { readingSettingsSheetLook } from "./reading-settings-look.ts";

  let {
    isOpen,
    settings,
    seriesTitle,
    onClose,
    onReturnFocus,
  }: {
    isOpen: boolean;
    settings: ReaderSettings;
    seriesTitle: string;
    onClose: () => void;
    onReturnFocus: () => void;
  } = $props();

  const chrome = getReaderChrome();
  const sheet = $derived(
    readingSettingsSheetLook(chrome.platform, chrome.width),
  );
  const content = $derived(
    readingSettingsContentLook(chrome.platform, chrome.width),
  );

  $effect(() => {
    if (!isOpen) {
      return;
    }
    return takeBackWithinScreen(onClose);
  });
</script>

<Dialog.Root
  open={isOpen}
  onOpenChange={(open: boolean) => {
    if (!open) {
      onClose();
    }
  }}
>
  <DrawerContent
    to="main"
    onDismiss={onClose}
    onCloseAutoFocus={(event: Event) => {
      event.preventDefault();
      onReturnFocus();
    }}
    class="max-block-reader-sheet"
  >
    <div class={sheet.header}>
      <DialogTitle class={sheet.title}>
        {m.reader_auto_scroll_speed_title()}
      </DialogTitle>
    </div>
    <div
      class={[
        "overflow-y-auto pbs-md pbe-sheet-bottom",
        content.group,
        sheet.body,
      ]}
    >
      <AutoScrollSpeedSetting
        {settings}
        {seriesTitle}
        control={content.control}
      />
    </div>
  </DrawerContent>
</Dialog.Root>
