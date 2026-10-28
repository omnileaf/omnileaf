<script lang="ts">
  import { CircleCheck, FolderOpen, Leaf, TriangleAlert } from "@lucide/svelte";

  import { currentPlatform } from "#lib/page/platform.ts";

  import { usesSetupPages } from "./setup-pages.ts";

  const CHECK_STROKE = 2.5;

  let {
    isEmpty,
    isUnreadable = false,
  }: { isEmpty: boolean; isUnreadable?: boolean } = $props();

  const isSetupPage = usesSetupPages(currentPlatform());
</script>

{#if isSetupPage}
  <span
    aria-hidden="true"
    class={[
      "flex items-center justify-center pbe-xs block-setup-hero-icon inline-setup-hero-icon",
      isEmpty && "text-muted",
      isUnreadable && "text-warning",
      !isEmpty && !isUnreadable && "text-windows-success",
    ]}
  >
    {#if isUnreadable}
      <TriangleAlert class="block-setup-hero-icon inline-setup-hero-icon" />
    {:else if isEmpty}
      <FolderOpen class="block-setup-hero-icon inline-setup-hero-icon" />
    {:else}
      <CircleCheck class="block-setup-hero-icon inline-setup-hero-icon" />
    {/if}
  </span>
{:else if isEmpty}
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
