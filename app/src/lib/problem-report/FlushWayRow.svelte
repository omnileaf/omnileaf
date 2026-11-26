<script lang="ts">
  import AboutButtonRow from "#lib/about/AboutButtonRow.svelte";

  import type { WayRowProps } from "./report-row-props.ts";

  let { icon, iconName, label, opensBrowser, onPress }: WayRowProps = $props();
</script>

<AboutButtonRow
  {icon}
  {iconName}
  {label}
  look="android"
  {opensBrowser}
  {onPress}
/>
