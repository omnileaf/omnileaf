<script lang="ts">
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { MACOS_DETAIL_NOTE, MACOS_LINK } from "./detail-field.ts";
  import RatedAdultNote from "./RatedAdultNote.svelte";

  let {
    isOn,
    isLocked,
    note,
    onToggle,
  }: {
    isOn: boolean;
    isLocked: boolean;
    note: string;
    onToggle: () => void;
  } = $props();

  const id = $props.id();
</script>

<div class="col-start-2 flex flex-col items-start gap-xs">
  <label
    class={[
      "flex items-center gap-native-checkbox-gap text-native-button/native-button font-native-button",
      isLocked && "text-muted",
    ]}
  >
    <Checkbox
      bind:checked={() => isOn, onToggle}
      disabled={isLocked}
      aria-labelledby="{id}-label"
      aria-describedby="{id}-note"
    />
    <span id="{id}-label">{m.edit_details_mark_adult()}</span>
  </label>
  <p id="{id}-note" class={MACOS_DETAIL_NOTE}>
    {#if isLocked}
      <RatedAdultNote linkClass={MACOS_LINK} />
    {:else}
      {note}
    {/if}
  </p>
</div>
