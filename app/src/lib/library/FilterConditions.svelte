<script lang="ts">
  import type { Inclusion, LibraryFilter } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import InclusionChoice from "./InclusionChoice.svelte";
  import { FILTER_CONDITIONS, type FilterCondition } from "./library-listing";

  interface ConditionWording {
    readonly label: () => string;
    readonly hint?: () => string;
  }

  const CONDITIONS: Record<FilterCondition, ConditionWording> = {
    unread: {
      label: m.library_filter_unread,
      hint: m.library_filter_unread_hint,
    },
    started: { label: m.library_filter_started },
    finished: {
      label: m.library_filter_finished,
      hint: m.library_filter_finished_hint,
    },
  };

  let {
    filter,
    showsHints,
    onChoose,
  }: {
    filter: LibraryFilter;
    showsHints: boolean;
    onChoose: (condition: FilterCondition, inclusion: Inclusion) => void;
  } = $props();
</script>

{#each FILTER_CONDITIONS as condition (condition)}
  {@const wording = CONDITIONS[condition]}
  <InclusionChoice
    label={wording.label()}
    hint={showsHints ? wording.hint?.() : undefined}
    chosen={filter[condition]}
    onChoose={(inclusion: Inclusion) => {
      onChoose(condition, inclusion);
    }}
  />
{/each}
