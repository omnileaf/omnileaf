<script lang="ts">
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { MACOS_DETAIL_NOTE, MACOS_LINK } from "./detail-field.ts";
  import RatedAdultNote from "./RatedAdultNote.svelte";

  let {
    isOn,
    isLocked,
    note,
    onChange,
  }: {
    isOn: boolean;
    isLocked: boolean;
    note: string;
    onChange: (isMarked: boolean) => void;
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
      bind:checked={() => isOn, onChange}
      disabled={isLocked}
      aria-describedby="{id}-note"
    />
    <span>{m.edit_details_mark_adult()}</span>
  </label>
  <p id="{id}-note" class={MACOS_DETAIL_NOTE}>
    {#if isLocked}
      <RatedAdultNote linkClass={MACOS_LINK} />
    {:else}
      {note}
    {/if}
  </p>
</div>
