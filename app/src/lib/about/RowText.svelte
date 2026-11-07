<script lang="ts">
  import {
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import { Icon as MaterialIcon } from "#lib/components/ui/icon/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import type { Glyph } from "#lib/page/glyph.ts";

  import { type AboutLook, type HintKind, ROW_ICON_SIZES } from "./look";

  const PANE_LABEL = "desktop:text-callout";

  let {
    icon: Icon,
    iconName,
    label,
    hint,
    hintKind = "prose",
    look,
  }: {
    icon: Glyph;
    iconName: IconName;
    label: string;
    hint: string;
    hintKind?: HintKind | undefined;
    look: AboutLook;
  } = $props();

  const isAddress = $derived(hintKind === "address");
</script>

{#if look === "android"}
  <MaterialIcon name={iconName} class="shrink-0" />
{:else}
  <ItemMedia aria-hidden="true" class="shrink-0">
    <Icon size={ROW_ICON_SIZES[look]} />
  </ItemMedia>
{/if}
<ItemContent>
  <ItemTitle class={look === "pane" ? PANE_LABEL : undefined}>{label}</ItemTitle
  >
  <ItemDescription
    dir={isAddress ? "ltr" : undefined}
    translate={isAddress ? "no" : undefined}
    class="text-footnote android:max-medium:text-native-row-subtitle/native-row-subtitle"
    >{hint}</ItemDescription
  >
</ItemContent>
