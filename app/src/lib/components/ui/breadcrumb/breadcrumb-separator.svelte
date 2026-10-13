<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";

  const ICON_SIZE = 14;

  let { class: className }: { class?: string } = $props();
</script>

<li role="presentation" aria-hidden="true" class={cn("shrink-0", className)}>
  <ChevronRight size={ICON_SIZE} class="rtl:-scale-x-100" />
</li>
