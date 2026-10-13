<script lang="ts">
  import type { Snippet } from "svelte";

  import { useStepperRoot } from "./stepper.svelte.ts";

  let { step = $bindable(1), children }: { step?: number; children?: Snippet } =
    $props();

  useStepperRoot({
    current: () => step,
    select: (chosen) => {
      step = chosen;
    },
  });
</script>

{@render children?.()}
