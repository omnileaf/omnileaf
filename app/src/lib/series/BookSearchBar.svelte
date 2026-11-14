<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { closesOnBack } from "#lib/navigation/overlay-back.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { ANDROID_SEARCH_VIEW } from "#lib/search/search-look.ts";

  let {
    field = $bindable(null),
    search,
    onSearch,
    onClose,
  }: {
    field?: HTMLInputElement | null;
    search: string;
    onSearch: (search: string) => void;
    onClose: () => void;
  } = $props();

  function closeOnEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }
</script>

<InputGroup
  class="flex-1 gap-lg rounded-full bg-native-search-view ps-lg pe-xs text-foreground block-native-button-large min-inline-none focus-within:focus-ring"
>
  <Icon name="search" class="shrink-0" />
  <Input
    bind:ref={field}
    {@attach closesOnBack}
    type="search"
    aria-label={m.series_find_book()}
    placeholder={m.series_find_book()}
    value={search}
    class="no-search-cancel text-native-search-field/native-search-field font-native-search-field tracking-native-search-field text-foreground"
    oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
      onSearch(event.currentTarget.value);
    }}
    onkeydown={closeOnEscape}
  />
  <Tooltip
    label={m.series_close_search()}
    type="button"
    aria-label={m.series_close_search()}
    onclick={onClose}
  >
    {#snippet child({ props })}
      <Button {...props} look="icon" class={ANDROID_SEARCH_VIEW.clear}>
        <Icon name="x" />
      </Button>
    {/snippet}
  </Tooltip>
</InputGroup>
