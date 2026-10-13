<script lang="ts">
  import { Search } from "@lucide/svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { searchQuery } from "./search-route";

  const ICON_SIZE = 22;
  const FIELD_ICON_SIZE = 18;

  function openSearch(
    event: Event & { currentTarget: HTMLInputElement },
  ): void {
    void goto(
      `${resolve("/(app)/search")}${searchQuery(event.currentTarget.value)}`,
    );
  }
</script>

<Tooltip label={m.search_open()}>
  {#snippet child({ props })}
    <a
      {...props}
      href={resolve("/(app)/search")}
      aria-label={m.search_open()}
      class="flex items-center justify-center rounded-full transition-control block-touch-target inline-touch-target hover:tint-hover active:tint-pressed large:hidden"
    >
      <Search size={ICON_SIZE} aria-hidden="true" />
    </a>
  {/snippet}
</Tooltip>
<div
  class="hidden items-center gap-sm rounded-control border border-field bg-card px-md text-muted block-pointer-button inline-library-search focus-within:border-accent large:flex"
>
  <Search size={FIELD_ICON_SIZE} aria-hidden="true" class="shrink-0" />
  <Input
    type="search"
    aria-label={m.search_library_field()}
    placeholder={m.search_library_placeholder()}
    maxlength={SEARCH_MAX_CHARS}
    class="no-search-cancel text-small text-foreground"
    oninput={openSearch}
  />
</div>
