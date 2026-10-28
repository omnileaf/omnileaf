<script lang="ts">
  import type { Snippet } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";

  import { stepButtonClass, type StepButtonKind } from "./step-button.ts";

  let {
    kind,
    disabled = false,
    isBusy = false,
    onclick,
    children,
  }: {
    kind: StepButtonKind;
    disabled?: boolean;
    isBusy?: boolean;
    onclick: () => void;
    children: Snippet;
  } = $props();

  function click(): void {
    if (!isBusy) {
      onclick();
    }
  }
</script>

<Button
  type="button"
  look={kind}
  {disabled}
  aria-disabled={isBusy || undefined}
  class={stepButtonClass(kind)}
  onclick={click}
>
  {@render children()}
</Button>
