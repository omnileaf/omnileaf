<script lang="ts">
  import type { CoverStackLook } from "./cover-tile";

  let { look, bookCount }: { look: CoverStackLook | null; bookCount: number } =
    $props();
</script>

{#if look !== null && bookCount > 1}
  <span data-slot="cover-sheet" aria-hidden="true" class={look.farSheet}></span>
  <span data-slot="cover-sheet" aria-hidden="true" class={look.nearSheet}
  ></span>
{/if}
