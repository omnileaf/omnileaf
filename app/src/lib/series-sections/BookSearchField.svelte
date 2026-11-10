<script lang="ts">
  import { Search } from "@lucide/svelte";

  import { Input } from "#lib/components/ui/input/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 16;
  const INPUT_COVERS_GROUP_BORDER =
    "android:max-medium:-my-px android:max-medium:self-stretch";

  let {
    search,
    onSearch,
    field = $bindable(null),
  }: {
    search: string;
    onSearch: (search: string) => void;
    field?: HTMLInputElement | null;
  } = $props();
</script>

<InputGroup
  class="flex-1 gap-sm rounded-shadcn-control border border-border bg-background px-md text-muted shadow-raised block-pointer-button max-inline-section-search min-inline-section-search-narrowest focus-within:border-accent android:max-medium:block-native-target"
>
  <Search size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
  <Input
    bind:ref={field}
    type="search"
    aria-label={m.series_find_book()}
    placeholder={m.series_find_book()}
    value={search}
    class={["text-small text-foreground", INPUT_COVERS_GROUP_BORDER]}
    oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
      onSearch(event.currentTarget.value);
    }}
  />
</InputGroup>
