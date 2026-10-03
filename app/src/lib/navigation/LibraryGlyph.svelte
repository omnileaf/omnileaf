<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import NavigationIcon from "./NavigationIcon.svelte";

  let { size, ...attributes }: { size: number; class?: ClassValue } = $props();
</script>

<NavigationIcon
  section="library"
  isSelected={false}
  isArriving={false}
  {size}
  {...attributes}
/>
