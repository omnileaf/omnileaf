<script lang="ts">
  import type { Snippet } from "svelte";

  import { useNumberField } from "./number-field.svelte.ts";

  let {
    value = $bindable(0),
    step = 1,
    min,
    max,
    children,
  }: {
    value?: number;
    step?: number;
    min?: number;
    max?: number;
    children: Snippet;
  } = $props();

  useNumberField({
    value: () => value,
    change: (next) => {
      value = next;
    },
    step: () => step,
    min: () => min,
    max: () => max,
  });
</script>

{@render children()}
