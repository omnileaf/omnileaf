<script lang="ts">
  import { Search } from "@lucide/svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { searchQuery } from "./search-route";

  const ICON_SIZE = 22;
  const FIELD_ICON_SIZE = 18;

  /** Carries on typing in the search page's own field. */
  function openSearch(
    event: Event & { currentTarget: HTMLInputElement },
  ): void {
    void goto(
      `${resolve("/(app)/search")}${searchQuery(event.currentTarget.value)}`,
    );
  }
</script>

<a
  href={resolve("/(app)/search")}
  aria-label={m.search_open()}
  title={m.search_open()}
  class="flex items-center justify-center rounded-full transition-control block-touch-target inline-touch-target hover:tint-hover active:tint-pressed large:hidden"
>
  <Search size={ICON_SIZE} aria-hidden="true" />
</a>
<div
  class="hidden items-center gap-sm rounded-control border border-field bg-card px-md text-muted block-pointer-button inline-library-search focus-within:border-accent large:flex"
>
  <Search size={FIELD_ICON_SIZE} aria-hidden="true" class="shrink-0" />
  <input
    type="search"
    aria-label={m.search_library_field()}
    placeholder={m.search_library_placeholder()}
    maxlength={SEARCH_MAX_CHARS}
    class="no-search-cancel flex-1 bg-transparent text-small text-foreground outline-none min-inline-none placeholder:text-muted"
    oninput={openSearch}
  />
</div>
