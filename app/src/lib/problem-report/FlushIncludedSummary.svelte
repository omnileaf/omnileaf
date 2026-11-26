<script lang="ts">
  import RowText from "#lib/about/RowText.svelte";
  import { Item } from "#lib/components/ui/item/index.ts";

  import type { IncludedSummaryProps } from "./report-row-props.ts";

  let { icon, iconName, label, hint, action }: IncludedSummaryProps = $props();
</script>

<Item look="row-static">
  <RowText {icon} {iconName} {label} {hint} look="android" />
  {@render action?.()}
</Item>
