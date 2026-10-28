<script lang="ts">
  import { FolderSearch } from "@lucide/svelte";

  import type { NumberRange } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { gapWords } from "./book-number-words";
  import type { SectionTileLook } from "./section-tile";

  const ICON_SIZE = 24;

  let { missing, look }: { missing: NumberRange; look: SectionTileLook } =
    $props();

  const words = $derived(gapWords(missing));
</script>

<div
  role="img"
  aria-label={words.label}
  class="flex flex-col gap-cover-caption"
>
  <span class={look.gap}>
    <FolderSearch size={ICON_SIZE} aria-hidden="true" />
  </span>
  <span class="flex flex-col min-inline-none">
    <span class={look.title}>{words.title}</span>
    <span class={look.meta}>{m.series_gap_meta()}</span>
  </span>
</div>
