<script lang="ts">
  import { ChevronRight, TriangleAlert } from "@lucide/svelte";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import {
    Item,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  const ICON_SIZE = 18;
  const CHEVRON_SIZE = 18;

  let { count, onOpen }: { count: number; onOpen: () => void } = $props();

  const numbers = $derived(new Intl.NumberFormat(getLocale()));
</script>

<div
  class="overflow-hidden rounded-list bg-warning-soft text-foreground android:rounded-android-md"
>
  <Item look="settings-section" class="inline-full">
    {#snippet child({ props })}
      <button type="button" aria-haspopup="dialog" onclick={onOpen} {...props}>
        <ItemMedia
          class="rounded-tile bg-warning-strong text-reader-black block-tile inline-tile ios:rounded-settings-chip-ios ios:block-settings-chip-ios ios:inline-settings-chip-ios android:rounded-full android:block-settings-chip android:inline-settings-chip"
        >
          <TriangleAlert size={ICON_SIZE} />
        </ItemMedia>
        <ItemContent class="text-start">
          <ItemTitle
            class="text-body ios:font-regular desktop:text-callout desktop:font-medium"
          >
            {m.attention_title()}
          </ItemTitle>
          <ItemDescription class="text-footnote text-foreground">
            {m.attention_things_to_fix({ count })}
          </ItemDescription>
        </ItemContent>
        <Badge
          look="count"
          aria-hidden="true"
          class="shrink-0 px-sm py-2xs text-caption"
        >
          {numbers.format(count)}
        </Badge>
        <ChevronRight
          size={CHEVRON_SIZE}
          class="shrink-0 text-muted rtl:-scale-x-100"
        />
      </button>
    {/snippet}
  </Item>
</div>
