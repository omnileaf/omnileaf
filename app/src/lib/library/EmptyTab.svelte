<script lang="ts">
  import { Folder, Plus, Sparkles } from "@lucide/svelte";

  import { assertNever } from "#lib/assert-never.ts";
  import EmptyAction from "#lib/page/EmptyAction.svelte";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { type EmptyTab, tabActionOf } from "./empty-cause.ts";

  let { tab, onAddSeries }: { tab: EmptyTab; onAddSeries: () => void } =
    $props();

  interface Wording {
    readonly icon: Glyph;
    readonly title: string;
    readonly body: string;
  }

  function wordingOf(empty: EmptyTab): Wording {
    switch (empty.kind) {
      case "category":
        return {
          icon: Folder,
          title: m.library_category_empty({ name: empty.name }),
          body: m.library_category_empty_body(),
        };
      case "newChapters":
        return {
          icon: Sparkles,
          title: m.library_new_chapters_empty(),
          body: m.library_new_chapters_empty_body(),
        };
      default:
        return assertNever(empty);
    }
  }

  const wording = $derived(wordingOf(tab));
  const action = $derived(tabActionOf(tab));
</script>

<EmptyState icon={wording.icon} title={wording.title} body={wording.body}>
  {#if action === "addSeries"}
    <EmptyAction
      icon={Plus}
      label={m.library_add_series()}
      rank="main"
      onclick={onAddSeries}
    />
  {/if}
</EmptyState>
