<script lang="ts">
  import type { LucideIcon } from "@lucide/svelte";

  let { icon: Icon }: { icon: LucideIcon } = $props();
</script>

<span
  aria-hidden="true"
  class="flex items-center justify-center rounded-full bg-accent-soft text-accent block-header-badge inline-header-badge"
>
  <Icon class="block-header-badge-icon inline-header-badge-icon" />
</span>
