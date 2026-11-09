<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  let {
    heading,
    isFinding,
    isSorting,
    onFind,
    onSortAndFilter,
  }: {
    heading: string;
    isFinding: boolean;
    isSorting: boolean;
    onFind: () => void;
    onSortAndFilter: () => void;
  } = $props();
</script>

<div class="flex items-center gap-sm">
  <h2
    class="flex-1 text-native-books-heading/native-books-heading font-native-books-heading tracking-native-books-heading min-inline-none"
  >
    {heading}
  </h2>
  <Button
    type="button"
    variant="plain"
    iconOnly
    label={m.series_find_book()}
    aria-expanded={isFinding}
    class="shrink-0"
    onclick={onFind}
  >
    <Icon name="search" />
  </Button>
  <Button
    type="button"
    variant="plain"
    iconOnly
    label={m.series_sort_and_filter()}
    aria-haspopup="dialog"
    aria-expanded={isSorting}
    class="shrink-0"
    onclick={onSortAndFilter}
  >
    <Icon name="list-filter" />
  </Button>
</div>
