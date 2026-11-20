<script lang="ts">
  import { LibraryBig, Sparkles, Tag } from "@lucide/svelte";

  import { assertNever } from "#lib/assert-never.ts";
  import EmptyAction from "#lib/page/EmptyAction.svelte";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { EmptyTab } from "./empty-cause.ts";

  let { tab, onGoToAll }: { tab: EmptyTab; onGoToAll: () => void } = $props();

  interface Wording {
    readonly icon: Glyph;
    readonly title: string;
    readonly body: string;
  }

  function wordingOf(empty: EmptyTab): Wording {
    switch (empty.kind) {
      case "category":
        return {
          icon: Tag,
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
</script>

<EmptyState icon={wording.icon} title={wording.title} body={wording.body}>
  <EmptyAction
    icon={LibraryBig}
    label={m.library_go_to_all({ tab: m.library_category_all() })}
    onclick={onGoToAll}
  />
</EmptyState>
