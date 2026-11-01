<script lang="ts">
  import { Check } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { CHECKBOX_GLYPH } from "./checkbox-glyph.ts";

  let { class: className }: { class?: ClassValue } = $props();

  const SIZE = 14;
  const STROKE = 3;
</script>

<Check
  size={SIZE}
  strokeWidth={STROKE}
  aria-hidden="true"
  class={[CHECKBOX_GLYPH, className]}
/>
