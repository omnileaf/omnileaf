<script lang="ts">
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import SidebarToggle from "#lib/navigation/SidebarToggle.svelte";

  let { class: className, children }: { class?: string; children: Snippet } =
    $props();
</script>

<div
  data-page-toolbar
  class={cn(
    "in-toolbar:sticky in-toolbar:-inset-bs-title-gap in-toolbar:z-series-bar in-toolbar:-ms-gutter in-toolbar:-me-page-end in-toolbar:-mbs-title-gap in-toolbar:flex in-toolbar:items-center in-toolbar:border-be in-toolbar:border-border in-toolbar:bg-background in-toolbar:px-lg in-toolbar:min-block-toolbar",
    className,
  )}
>
  <div
    class="hidden items-center gap-sm desktop:expanded:flex in-toolbar:me-sm"
  >
    <SidebarToggle />
    <span
      aria-hidden="true"
      class="me-sm border-s border-border block-toolbar-rule"
    ></span>
  </div>
  {@render children()}
</div>
