<script lang="ts">
  import { Keyboard, X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { SheetContent } from "#lib/components/ui/sheet/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { undoShortcutOn } from "#lib/notices/undo-shortcut.ts";
  import { usesCommandKey } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { keyNames } from "#lib/screenshot-mode/key-combination.ts";
  import { getScreenshotModeShortcut } from "#lib/screenshot-mode/shortcut-setting.svelte.ts";
  import {
    quickOpenShortcutLabel,
    searchShortcutLabel,
  } from "#lib/search/quick-open-shortcut.ts";

  interface KeyRow {
    readonly label: string;
    readonly keys: readonly string[];
  }

  interface KeyGroup {
    readonly title: string;
    readonly rows: readonly KeyRow[];
  }

  const ICON_SIZE = 18;

  let {
    isOpen,
    platform,
    onClose,
  }: {
    isOpen: boolean;
    platform: Platform;
    onClose: () => void;
  } = $props();

  const screenshotModeShortcut = getScreenshotModeShortcut();

  function withCommand(key: string): string {
    return usesCommandKey(platform)
      ? m.reader_key_command_mac({ key })
      : m.reader_key_command({ key });
  }

  const columns = $derived<readonly (readonly KeyGroup[])[]>([
    [
      {
        title: m.app_shortcuts_everywhere(),
        rows: [
          {
            label: m.quick_open_title(),
            keys: [quickOpenShortcutLabel(platform)],
          },
          {
            label: m.app_shortcuts_search(),
            keys: [searchShortcutLabel(platform)],
          },
          { label: m.undo_action(), keys: [undoShortcutOn(platform).label()] },
          {
            label: m.screenshot_mode_title(),
            keys: [
              keyNames(screenshotModeShortcut.combination, platform).join(" "),
            ],
          },
          { label: m.settings_title(), keys: [withCommand(",")] },
          { label: m.app_shortcuts_title(), keys: ["?"] },
        ],
      },
      {
        title: m.app_shortcuts_going_back(),
        rows: [
          {
            label: m.app_shortcuts_back(),
            keys: [
              usesCommandKey(platform)
                ? m.reader_key_back_mac()
                : m.reader_key_back(),
            ],
          },
          { label: m.app_shortcuts_close(), keys: [m.reader_key_esc()] },
        ],
      },
    ],
    [
      {
        title: m.library_title(),
        rows: [
          {
            label: m.app_shortcuts_move_covers(),
            keys: ["←", "→", "↑", "↓"],
          },
          { label: m.app_shortcuts_open_series(), keys: [m.app_key_enter()] },
          { label: m.app_shortcuts_select(), keys: [m.reader_key_space()] },
          { label: m.app_shortcuts_select_all(), keys: [withCommand("A")] },
        ],
      },
      {
        title: m.settings_title(),
        rows: [
          {
            label: m.app_shortcuts_move_tab(),
            keys: [m.app_key_alt_up(), m.app_key_alt_down()],
          },
        ],
      },
    ],
  ]);
</script>

<Dialog.Root
  open={isOpen}
  onOpenChange={(open: boolean) => {
    if (!open) {
      onClose();
    }
  }}
>
  <SheetContent to="main" dimsBehind class="bg-background inline-app-shortcuts">
    <div class="flex items-center gap-md px-lg pbs-lg">
      <span
        class="flex shrink-0 items-center justify-center rounded-shadcn-control bg-chip block-reader-dense inline-reader-dense"
      >
        <Keyboard size={ICON_SIZE} aria-hidden="true" />
      </span>
      <DialogTitle class="flex-1 text-group-title font-semibold">
        {m.app_shortcuts_title()}
      </DialogTitle>
      <Dialog.Close>
        {#snippet child({ props })}
          <Button
            {...props}
            look="icon"
            aria-label={m.app_shortcuts_dismiss()}
            class="text-muted block-reader-dense inline-reader-dense hover:bg-hover hover:text-foreground"
          >
            <X size={ICON_SIZE} aria-hidden="true" />
          </Button>
        {/snippet}
      </Dialog.Close>
    </div>
    <div class="flex flex-1 flex-col overflow-y-auto px-lg pbe-lg">
      <Dialog.Description class="text-small text-muted">
        {m.app_shortcuts_reader_note()}
      </Dialog.Description>
      <div class="grid grid-cols-2 gap-x-2xl">
        {#each columns as column, index (index)}
          <div class="flex flex-col divide-y divide-border min-inline-none">
            {#each column as group (group.title)}
              <section class="flex flex-col gap-sm py-lg">
                <h3 class="text-small font-semibold">{group.title}</h3>
                <dl class="flex flex-col gap-sm text-small">
                  {#each group.rows as row (row.label)}
                    <div class="flex items-center justify-between gap-md">
                      <dt>{row.label}</dt>
                      <dd class="flex flex-wrap justify-end gap-xs">
                        {#each row.keys as key (key)}
                          <Kbd>{key}</Kbd>
                        {/each}
                      </dd>
                    </div>
                  {/each}
                </dl>
              </section>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </SheetContent>
</Dialog.Root>
