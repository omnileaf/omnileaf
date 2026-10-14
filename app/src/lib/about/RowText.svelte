<script lang="ts">
  import {
    ItemContent,
    ItemDescription,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";

  import type { AboutLook, HintKind } from "./look";

  const LABELS = {
    phone: "",
    pane: "desktop:text-callout",
  } satisfies Record<AboutLook, string>;

  let {
    label,
    hint,
    hintKind = "prose",
    look,
  }: {
    label: string;
    hint: string;
    hintKind?: HintKind | undefined;
    look: AboutLook;
  } = $props();

  const isAddress = $derived(hintKind === "address");
</script>

<ItemContent class="wrap-anywhere">
  <ItemTitle class={LABELS[look]}>{label}</ItemTitle>
  <ItemDescription
    dir={isAddress ? "ltr" : undefined}
    translate={isAddress ? "no" : undefined}
    class="text-footnote">{hint}</ItemDescription
  >
</ItemContent>
