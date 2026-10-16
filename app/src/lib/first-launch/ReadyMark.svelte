<script lang="ts">
  import { FolderOpen, Leaf } from "@lucide/svelte";

  const CHECK_STROKE = 2.5;

  let { isEmpty }: { isEmpty: boolean } = $props();
</script>

{#if isEmpty}
  <span
    aria-hidden="true"
    class="flex items-center justify-center rounded-full bg-chip block-app-icon inline-app-icon"
  >
    <FolderOpen class="block-ready-icon inline-ready-icon" />
  </span>
{:else}
  <span aria-hidden="true" class="relative inline-flex pe-ready-leaf-reach">
    <span
      class="flex items-center justify-center rounded-full bg-accent text-on-accent block-app-icon inline-app-icon motion-safe:animate-ready-grow"
    >
      <svg
        viewBox="0 0 24 24"
        class="fill-none stroke-current block-ready-check inline-ready-check"
      >
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          pathLength="1"
          stroke-dasharray="1"
          class="motion-safe:animate-ready-draw"
          stroke-width={CHECK_STROKE}
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <Leaf
      class="absolute inset-e-none -inset-bs-ready-leaf-lift origin-bottom-left text-accent block-ready-leaf inline-ready-leaf motion-safe:animate-ready-leaf rtl:origin-bottom-right"
    />
  </span>
{/if}
