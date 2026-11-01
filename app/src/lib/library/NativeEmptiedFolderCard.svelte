<script lang="ts">
  import { RefreshCw, Trash } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    EMPTIED_FOLDER_LOOKS,
    type EmptiedFolderLook,
  } from "./emptied-folder-looks";
  import { folderTitle } from "./folder-title";
  import { NATIVE_ALERT_ROW } from "./native-alert-row";
  import type { EmptiedFolder } from "./rescans.svelte";

  const ICON_SIZE = 22;
  const ALERT_ACTION_ICON_SIZE = 17;

  type Asked = (asker: HTMLButtonElement) => void;

  let {
    folder,
    emptied,
    isBusy,
    onRescan,
    onRemove,
  }: {
    folder: LibraryFolder;
    emptied: EmptiedFolder;
    isBusy: boolean;
    onRescan: Asked;
    onRemove: Asked;
  } = $props();

  const titleId = $props.id();
  const look: EmptiedFolderLook = $derived(EMPTIED_FOLDER_LOOKS[emptied]);
  const name = $derived(folderTitle(folder));
  const Icon = $derived(look.nativeIcon);
  const action: Snippet<[string, Glyph, Asked]> = actionRow;
</script>

{#snippet actionRow(label: string, ActionIcon: Glyph, onAsk: Asked)}
  <button
    type="button"
    disabled={isBusy}
    class={NATIVE_ALERT_ROW}
    onclick={(event) => {
      onAsk(event.currentTarget);
    }}
  >
    <ActionIcon
      size={ALERT_ACTION_ICON_SIZE}
      class="absolute inset-s-native-alert-action-icon"
    />
    {label}
  </button>
{/snippet}

<div
  role={look.role}
  aria-labelledby={titleId}
  class="grid grid-cols-alert gap-x-native-row-gap gap-y-2xs rounded-native-group bg-warning-soft px-native-row-start pbs-native-alert-block font-ui wrap-anywhere text-on-warning"
>
  <Icon size={ICON_SIZE} class="row-span-2" />
  <h3
    id={titleId}
    class="col-start-2 text-native-row-title/native-row-title font-semibold tracking-native-row-title"
  >
    {look.title({ name })}
  </h3>
  <p
    class="col-start-2 text-native-row-subtitle/native-row-subtitle tracking-native-row-subtitle"
  >
    {look.body({ name })}
  </p>
  <div class="col-span-full -mx-native-row-start mbs-md flex flex-col">
    {@render action(look.remove(), Trash, onRemove)}
    {@render action(m.library_rescan_folder(), RefreshCw, onRescan)}
  </div>
</div>
