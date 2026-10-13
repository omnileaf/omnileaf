<script lang="ts">
  import { Check } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  let { class: className }: { class?: ClassValue } = $props();

  const SIZE = 14;
  const STROKE = 3;
</script>

<Check size={SIZE} strokeWidth={STROKE} aria-hidden="true" class={className} />
