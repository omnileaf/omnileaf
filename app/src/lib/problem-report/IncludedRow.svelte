<script lang="ts">
  import type { Snippet } from "svelte";

  import RowText from "#lib/about/RowText.svelte";
  import { Item } from "#lib/components/ui/item/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import type { Glyph } from "#lib/page/glyph.ts";

  import {
    CurrentReportRowsLook,
    ICON_TILE,
    TILE_ICON_SIZE,
  } from "./report-rows-look.ts";

  let {
    icon: Icon,
    iconName,
    label,
    hint,
    action,
    children,
  }: {
    icon: Glyph;
    iconName: IconName;
    label: string;
    hint: string;
    action?: Snippet;
    children?: Snippet;
  } = $props();

  const rowsLook = new CurrentReportRowsLook();
</script>

<li class="flex flex-col">
  {#if rowsLook.current === "flush"}
    <Item look="row-static">
      <RowText icon={Icon} {iconName} {label} {hint} look="android" />
      {@render action?.()}
    </Item>
  {:else}
    <div class="flex items-center gap-md px-lg py-md min-block-touch-target">
      <span aria-hidden="true" class={ICON_TILE}>
        <Icon size={TILE_ICON_SIZE} />
      </span>
      <span class="flex flex-1 flex-col gap-2xs wrap-anywhere min-inline-none">
        <span class="font-medium expanded:font-semibold">{label}</span>
        <span class="text-detail text-muted">{hint}</span>
      </span>
      {@render action?.()}
    </div>
  {/if}
  {@render children?.()}
</li>
