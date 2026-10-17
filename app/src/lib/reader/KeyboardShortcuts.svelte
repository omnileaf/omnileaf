<script lang="ts">
  import { Keyboard, X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { SheetContent } from "#lib/components/ui/sheet/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { usesCommandKey } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { READER_BUTTON, READER_ICON_SIZE } from "./reader-bar.ts";

  interface KeyRow {
    readonly label: string;
    readonly keys: readonly string[];
  }

  let {
    isOpen,
    platform,
    onClose,
  }: {
    isOpen: boolean;
    platform: Platform;
    onClose: () => void;
  } = $props();

  const isMac = $derived(usesCommandKey(platform));

  function withCommand(key: string): string {
    return isMac
      ? m.reader_key_command_mac({ key })
      : m.reader_key_command({ key });
  }

  const groups = $derived<readonly { title: string; rows: KeyRow[] }[]>([
    {
      title: m.reader_shortcuts_turning(),
      rows: [
        {
          label: m.reader_next_page(),
          keys: ["→", m.reader_key_space(), m.reader_key_page_down()],
        },
        {
          label: m.reader_previous_page(),
          keys: ["←", m.reader_key_shift_space(), m.reader_key_page_up()],
        },
        { label: m.reader_first_page(), keys: [m.reader_key_home()] },
        { label: m.reader_last_page(), keys: [m.reader_key_end()] },
      ],
    },
    {
      title: m.reader_shortcuts_reader(),
      rows: [
        { label: m.reader_toggle_controls(), keys: ["M"] },
        { label: m.reader_full_screen(), keys: ["F"] },
        { label: m.reader_leave_full_screen(), keys: [m.reader_key_esc()] },
        {
          label: m.reader_back_to_the_series(),
          keys: [
            m.reader_key_esc(),
            isMac ? m.reader_key_back_mac() : m.reader_key_back(),
          ],
        },
        { label: m.reader_jump_or_close(), keys: ["G"] },
        { label: m.reader_keyboard_shortcuts(), keys: ["?"] },
      ],
    },
    {
      title: m.reader_shortcuts_zoom(),
      rows: [
        { label: m.reader_zoom_in(), keys: [withCommand("+")] },
        { label: m.reader_zoom_out(), keys: [withCommand("−")] },
        { label: m.reader_zoom_fit(), keys: [withCommand("0")] },
      ],
    },
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
  <SheetContent
    to="main"
    dimsBehind
    class="bg-background inline-reader-shortcuts"
  >
    <div class="flex items-center gap-md px-lg pbs-lg">
      <span
        class="flex shrink-0 items-center justify-center rounded-shadcn-control bg-chip block-reader-dense inline-reader-dense"
      >
        <Keyboard size={READER_ICON_SIZE} aria-hidden="true" />
      </span>
      <DialogTitle class="flex-1 text-group-title font-semibold">
        {m.reader_keyboard_shortcuts()}
      </DialogTitle>
      <Dialog.Close>
        {#snippet child({ props })}
          <Button
            {...props}
            look="icon"
            aria-label={m.reader_shortcuts_close()}
            class={READER_BUTTON}
          >
            <X size={READER_ICON_SIZE} aria-hidden="true" />
          </Button>
        {/snippet}
      </Dialog.Close>
    </div>
    <div class="flex flex-1 flex-col overflow-y-auto px-lg pbe-lg">
      <Dialog.Description class="text-body text-muted">
        {m.reader_shortcuts_reversed()}
      </Dialog.Description>
      <div class="flex flex-col divide-y divide-border">
        {#each groups as group (group.title)}
          <section class="flex flex-col gap-sm py-lg">
            <h3 class="text-body font-semibold">{group.title}</h3>
            <dl class="flex flex-col gap-sm text-body">
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
      <p class="text-caption text-muted">{m.reader_shortcuts_escape()}</p>
      <p class="pbs-sm text-caption text-muted">
        {m.reader_shortcuts_typing()}
      </p>
    </div>
  </SheetContent>
</Dialog.Root>
