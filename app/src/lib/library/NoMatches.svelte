<script lang="ts">
  import { ListFilter, X } from "@lucide/svelte";

  import type { LibraryFilter } from "#lib/ipc/bindings.ts";
  import EmptyAction from "#lib/page/EmptyAction.svelte";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { chipsOf } from "./active-filters";

  let { filter, onClear }: { filter: LibraryFilter; onClear: () => void } =
    $props();

  const labels = $derived(chipsOf(filter).map(({ label }) => label));
  const body = $derived.by(() => {
    const [only] = labels;
    if (labels.length === 0 || only === undefined) {
      return m.library_no_matches_unchanged();
    }
    if (labels.length === 1) {
      return m.library_no_matches_one({ filter: only });
    }
    const filters = new Intl.ListFormat(getLocale(), {
      type: "conjunction",
    }).format(labels);
    return m.library_no_matches_many({ filters });
  });
</script>

<EmptyState icon={ListFilter} title={m.library_no_matches_title()} {body}>
  <EmptyAction
    icon={X}
    label={m.library_clear_all_filters()}
    rank="other"
    onclick={onClear}
  />
</EmptyState>
