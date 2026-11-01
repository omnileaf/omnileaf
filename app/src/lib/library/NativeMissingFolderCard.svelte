<script lang="ts">
  import { TriangleAlert, X } from "@lucide/svelte";

  import type { MissingFolder } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { missingFolderCardOf } from "./missing-folder-card.ts";
  import type { MissingFolderActions } from "./missing-folder-notices.ts";
  import { NATIVE_ALERT_ROW } from "./native-alert-row.ts";

  const ICON_SIZE = 22;
  const DISMISS_ICON_SIZE = 17;

  let {
    missing,
    isStillFailing,
    handlers,
    onHide,
    onDismiss,
  }: {
    missing: MissingFolder;
    isStillFailing: boolean;
    handlers: MissingFolderActions;
    onHide: (missing: MissingFolder) => void;
    onDismiss: (missing: MissingFolder) => void;
  } = $props();

  const titleId = $props.id();
  const content = $derived(
    missingFolderCardOf({
      missing,
      isStillFailing,
      handlers,
      onHide,
      hidesLast: true,
    }),
  );
</script>

<div
  role="status"
  data-slot="missing-folder-card"
  aria-labelledby={titleId}
  class="relative mbs-xs mbe-sm grid grid-cols-alert gap-x-native-row-gap gap-y-2xs rounded-native-group bg-warning-soft px-native-row-start pbs-native-alert-block font-ui wrap-anywhere text-on-warning"
>
  <TriangleAlert size={ICON_SIZE} class="row-span-2" aria-hidden="true" />
  <p
    id={titleId}
    class="col-start-2 pe-xl text-native-row-title/native-row-title font-semibold tracking-native-row-title"
  >
    {content.title}
  </p>
  <p
    class="col-start-2 pe-xl text-native-row-subtitle/native-row-subtitle tracking-native-row-subtitle"
  >
    {content.body}
  </p>
  <div class="col-span-full -mx-native-row-start mbs-md flex flex-col">
    {#each content.actions as action (action.label)}
      <button type="button" class={NATIVE_ALERT_ROW} onclick={action.run}>
        {action.label}
      </button>
    {/each}
  </div>
  <button
    type="button"
    aria-label={m.notice_dismiss()}
    class="absolute inset-e-native-alert-dismiss-inset inset-bs-native-alert-dismiss-inset flex items-center justify-center rounded-full block-native-button inline-native-button active:bg-native-row-pressed"
    onclick={() => {
      onDismiss(missing);
    }}
  >
    <X size={DISMISS_ICON_SIZE} aria-hidden="true" />
  </button>
</div>
