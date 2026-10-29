<script lang="ts">
  import type { Snippet } from "svelte";

  import { Card } from "#lib/components/ui/card/index.ts";

  let {
    label,
    count,
    children,
  }: {
    label: string;
    count: string;
    children: Snippet;
  } = $props();
</script>

<Card
  role="group"
  aria-label={label}
  class="sticky inset-be-lg flex items-center gap-2xs self-center p-xs shadow-popover"
>
  <span
    class="me-xs rounded-control bg-accent-soft px-sm text-detail font-bold whitespace-nowrap"
  >
    {count}
  </span>
  {@render children()}
</Card>
