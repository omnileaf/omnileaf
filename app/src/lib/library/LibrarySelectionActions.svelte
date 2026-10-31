<script lang="ts">
  import { Trash } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { DOCKED_BAR, DOCKED_ROW } from "#lib/navigation/tab-bar.ts";
  import SelectionToolbar from "#lib/page/SelectionToolbar.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import { AndroidPhone } from "./android-phone.svelte";
  import { selectionActions } from "./selection-actions.ts";
  import type { LabelsFrom } from "./series-selection";

  const ICON_SIZE = 18;
  const PILL_ICON_SIZE = 16;
  const ANDROID_ICON_SIZE = 24;

  let {
    count,
    isPill,
    keepsLabels,
    onLabels,
    onMarkRead,
    onDelete,
    onCancel,
  }: {
    count: number;
    isPill: boolean;
    keepsLabels: boolean;
    onLabels: (from: LabelsFrom) => void;
    onMarkRead: () => void;
    onDelete: () => void;
    onCancel: () => void;
  } = $props();

  const android = new AndroidPhone();
  const actions = $derived([
    ...selectionActions({ keepsLabels, onLabels, onMarkRead }),
    { name: "delete", icon: Trash, label: m.library_delete(), act: onDelete },
  ]);
</script>

{#if android.isOn}
  <div
    role="group"
    aria-label={m.library_selection_toolbar()}
    data-picking-bar
    class="sticky -inset-be-xl z-tab-bar -mx-page-start -me-page-end shrink-0 bg-bar pbe-safe-bottom {DOCKED_BAR}"
  >
    <ul class="flex p-sm {DOCKED_ROW}">
      {#each actions as { name, icon: Icon, label, act } (name)}
        <li class="flex-1 min-inline-none">
          <button
            type="button"
            class="group flex flex-col items-center gap-xs text-native-tab/native-tab font-native-tab tracking-native-tab text-muted inline-full min-block-touch-target"
            onclick={act}
          >
            <span
              class="flex items-center justify-center rounded-full transition-control block-2xl inline-pill group-active:tint-pressed"
            >
              <Icon size={ANDROID_ICON_SIZE} aria-hidden="true" />
            </span>
            {label}
          </button>
        </li>
      {/each}
    </ul>
  </div>
{:else if isPill}
  <SelectionToolbar
    label={m.library_selection_toolbar()}
    count={m.library_selected_series({ count })}
  >
    {#each actions as { name, icon: Icon, label, act } (name)}
      <Button
        type="button"
        look="bar-icon"
        class="flex items-center gap-xs px-sm text-small font-medium block-pointer-target"
        onclick={act}
      >
        <Icon size={PILL_ICON_SIZE} aria-hidden="true" />
        {label}
      </Button>
    {/each}
    <span aria-hidden="true" class="mx-xs self-stretch border-s border-border"
    ></span>
    <Button
      type="button"
      look="bar-icon"
      aria-keyshortcuts="Escape"
      class="flex items-center gap-xs px-sm text-small font-medium block-pointer-target"
      onclick={onCancel}
    >
      {m.library_cancel()}
      <Kbd>{m.series_escape_key()}</Kbd>
    </Button>
  </SelectionToolbar>
{:else}
  <Card
    role="group"
    aria-label={m.library_selection_toolbar()}
    class="sticky inset-be-lg flex gap-2xs p-xs shadow-popover ios:max-medium:inset-be-none"
  >
    {#each actions as { name, icon: Icon, label, act } (name)}
      <Button
        type="button"
        look="bar-icon"
        class="flex-1 flex-col text-caption font-semibold min-block-selection-action"
        onclick={act}
      >
        <Icon size={ICON_SIZE} aria-hidden="true" />
        {label}
      </Button>
    {/each}
  </Card>
{/if}
