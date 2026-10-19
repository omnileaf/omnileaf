<script lang="ts">
  import { Search } from "@lucide/svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { type Platform, SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { shortcut } from "#lib/shortcut.ts";

  import { searchShortcutLabel } from "./quick-open-shortcut.ts";
  import { searchQuery } from "./search-route";

  const ICON_SIZE = 16;
  const FIELD_ICON_SIZE = 16;

  let { platform }: { platform: Platform } = $props();

  function searchTheLibrary(): void {
    void goto(resolve("/(app)/search"));
  }

  function openSearch(
    event: Event & { currentTarget: HTMLInputElement },
  ): void {
    void goto(
      resolve(`/(app)/search${searchQuery(event.currentTarget.value)}`),
    );
  }
</script>

<svelte:window
  {@attach shortcut({
    key: "f",
    command: platform,
    shift: false,
    inTextFields: true,
    run: searchTheLibrary,
  })}
/>

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
<InputGroup
  class="hidden gap-sm rounded-input-group border border-input-group-edge bg-input-group px-md text-muted block-shadcn-control inline-library-search focus-within:border-accent large:flex macos:shadow-raised windows:border-be-windows-stroke-strong linux:shadow-raised in-toolbar:inline-library-search-toolbar"
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
  <Kbd aria-hidden="true">{searchShortcutLabel(platform)}</Kbd>
</InputGroup>
