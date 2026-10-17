<script lang="ts">
  import type { LucideIcon } from "@lucide/svelte";

  let { icon: Icon }: { icon: LucideIcon } = $props();
</script>

<span
  aria-hidden="true"
  class="flex items-center justify-center rounded-full bg-step-tint text-accent block-step-badge inline-step-badge"
>
  <Icon class="block-step-badge-icon inline-step-badge-icon" />
</span>
