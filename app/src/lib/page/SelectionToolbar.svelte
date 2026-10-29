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
  class="sticky inset-be-lg flex items-center gap-2xs self-center p-xs shadow-popover ios:rounded-full ios:border-transparent ios:bg-native-glass ios:shadow-native-shadow-glass ios:backdrop-blur-native-glass macos:rounded-full macos:border-transparent macos:bg-native-glass macos:shadow-native-shadow-glass macos:backdrop-blur-native-glass"
>
  <span
    class="me-xs rounded-control bg-accent-soft px-sm text-detail font-bold whitespace-nowrap"
  >
    {count}
  </span>
  {@render children()}
</Card>
