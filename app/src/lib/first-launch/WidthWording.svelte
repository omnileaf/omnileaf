<script lang="ts">
  import type { WordingByWidth } from "./wording";

  let { wording }: { wording: WordingByWidth } = $props();
</script>

{#if wording.onPhones === wording.fromMedium}
  {wording.fromMedium()}
{:else}
  <span class="medium:hidden">{wording.onPhones()}</span>
  <span class="hidden medium:inline">{wording.fromMedium()}</span>
{/if}
