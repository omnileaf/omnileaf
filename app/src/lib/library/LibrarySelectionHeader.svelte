<script lang="ts">
  import { X } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { isPointer, usesCommandKey } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 20;

  let {
    platform,
    count,
    onSelectAll,
    onCancel,
  }: {
    platform: Platform;
    count: number;
    onSelectAll: () => void;
    onCancel: () => void;
  } = $props();
</script>

<h1 class="sr-only">{m.library_title()}</h1>
<div
  data-page-toolbar
  class="sticky -inset-bs-page-top z-series-bar -ms-page-start -me-page-end -mbs-page-top flex items-center gap-sm bg-background ps-page-start pe-page-end pbs-page-top pbe-xs in-toolbar:-inset-bs-title-gap in-toolbar:-ms-gutter in-toolbar:-mbs-title-gap in-toolbar:border-be in-toolbar:border-border in-toolbar:px-lg in-toolbar:pbs-none in-toolbar:pbe-none in-toolbar:min-block-toolbar"
>
  <Tooltip
    label={m.library_cancel_selecting()}
    type="button"
    aria-label={m.library_cancel_selecting()}
    aria-keyshortcuts="Escape"
    onclick={onCancel}
  >
    {#snippet child({ props })}
      <Button
        {...props}
        look="icon"
        class="block-touch-target inline-touch-target in-toolbar:block-pointer-button in-toolbar:inline-pointer-button"
      >
        <X size={ICON_SIZE} aria-hidden="true" />
      </Button>
    {/snippet}
  </Tooltip>
  <p
    class="flex-1 text-title font-semibold in-toolbar:text-body"
    aria-live="polite"
  >
    {m.library_selected_series({ count })}
  </p>
  <Button
    type="button"
    look="text"
    aria-keyshortcuts={usesCommandKey(platform) ? "Meta+A" : "Control+A"}
    class="flex items-center gap-sm px-xs text-body min-block-touch-target in-toolbar:text-small in-toolbar:min-block-pointer-button"
    onclick={onSelectAll}
  >
    {m.library_select_all()}
    {#if isPointer(platform)}
      <Kbd>
        {usesCommandKey(platform)
          ? m.library_select_all_command()
          : m.library_select_all_control()}
      </Kbd>
    {/if}
  </Button>
</div>
