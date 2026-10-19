<script lang="ts">
  import {
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import type { Glyph } from "#lib/page/glyph.ts";

  import { type AboutLook, type HintKind, ROW_ICON_SIZES } from "./look";

  const LABELS = {
    phone: "",
    pane: "desktop:text-callout",
  } satisfies Record<AboutLook, string>;

  let {
    icon: Icon,
    label,
    hint,
    hintKind = "prose",
    look,
  }: {
    icon: Glyph;
    label: string;
    hint: string;
    hintKind?: HintKind | undefined;
    look: AboutLook;
  } = $props();

  const isAddress = $derived(hintKind === "address");
</script>

<ItemMedia aria-hidden="true" class="shrink-0">
  <Icon size={ROW_ICON_SIZES[look]} />
</ItemMedia>
<ItemContent class="wrap-anywhere">
  <ItemTitle class={LABELS[look]}>{label}</ItemTitle>
  <ItemDescription
    dir={isAddress ? "ltr" : undefined}
    translate={isAddress ? "no" : undefined}
    class="text-footnote">{hint}</ItemDescription
  >
</ItemContent>
