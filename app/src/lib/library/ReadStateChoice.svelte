<script lang="ts">
  import type { LibraryFilter } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SettingChoice from "#lib/reader/SettingChoice.svelte";

  import { READ_STATE_LABELS } from "./filter-labels";
  import { READ_STATES, type ReadState, readStateOf } from "./library-listing";

  let {
    filter,
    onChoose,
  }: { filter: LibraryFilter; onChoose: (state: ReadState) => void } = $props();
</script>

<SettingChoice
  isStacked
  label={m.library_read_state()}
  choices={READ_STATES.map((state) => ({
    value: state,
    label: READ_STATE_LABELS[state](),
  }))}
  chosen={readStateOf(filter)}
  {onChoose}
/>
