<script lang="ts">
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import type { LibraryFilter } from "#lib/ipc/bindings.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SettingChoice from "#lib/reader/SettingChoice.svelte";

  import { READ_STATE_LABELS } from "./filter-labels";
  import { MAC_INSPECTOR } from "./filter-sheet-look";
  import { READ_STATES, type ReadState, readStateOf } from "./library-listing";

  let {
    filter,
    onChoose,
  }: { filter: LibraryFilter; onChoose: (state: ReadState) => void } = $props();

  const platform = currentPlatform();
  const isMac = platform === "macos";
  const usesSelect = platform === "windows" || isMac;
  const labelId = $props.id();

  function isReadState(value: string): value is ReadState {
    return READ_STATES.some((state) => state === value);
  }

  function chooseState({
    currentTarget: { value },
  }: Event & { currentTarget: HTMLSelectElement }): void {
    if (isReadState(value)) {
      onChoose(value);
    }
  }
</script>

{#if usesSelect}
  <div class="flex flex-col gap-sm">
    <span id={labelId} class={isMac ? MAC_INSPECTOR.label : "text-small"}>
      {m.library_read_state()}
    </span>
    <NativeSelect
      aria-labelledby={labelId}
      value={readStateOf(filter)}
      onchange={chooseState}
    >
      {#each READ_STATES as state (state)}
        <option value={state}>{READ_STATE_LABELS[state]()}</option>
      {/each}
    </NativeSelect>
  </div>
{:else}
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
{/if}
