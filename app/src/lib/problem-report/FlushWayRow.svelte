<script lang="ts">
  import AboutButtonRow from "#lib/about/AboutButtonRow.svelte";
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";

  import type { WayRowProps } from "./report-row-props.ts";

  let { icon, iconName, label, opensBrowser, onPress }: WayRowProps = $props();
</script>

<AboutButtonRow
  {icon}
  {iconName}
  {label}
  look="android"
  class={ROW_FOCUS_RING}
  {opensBrowser}
  {onPress}
/>
