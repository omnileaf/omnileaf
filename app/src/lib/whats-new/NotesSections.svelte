<script lang="ts">
  import type { ChangeKind, VersionNotes } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { FLUSH_LIST_HEADING } from "#lib/settings/android-flush-look.ts";

  import { changeGroups } from "./change-groups.ts";

  let { notes }: { notes: VersionNotes } = $props();

  const HEADINGS = {
    breaking: m.whats_new_breaking_in,
    sec: m.whats_new_sec_in,
    feat: m.whats_new_feat_in,
    perf: m.whats_new_perf_in,
    fix: m.whats_new_fix_in,
  } satisfies Record<ChangeKind, (inputs: { version: string }) => string>;

  const idPrefix = $props.id();
  const groups = $derived(changeGroups(notes));
</script>

{#each groups as { kind, summaries } (kind)}
  {@const headingId = `${idPrefix}-${kind}`}
  <section data-settings-group aria-labelledby={headingId}>
    <h2 id={headingId} class={FLUSH_LIST_HEADING}>
      {HEADINGS[kind]({ version: notes.version })}
    </h2>
    <ul class="flex list-disc flex-col ps-lg pbe-sm marker:text-muted">
      {#each summaries as summary, index (index)}
        <li lang="en" dir="ltr" class="py-xs ps-xs text-body">{summary}</li>
      {/each}
    </ul>
  </section>
{/each}
