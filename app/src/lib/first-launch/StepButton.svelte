<script lang="ts">
  import type { Snippet } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";

  import { stepButtonClass, type StepButtonKind } from "./step-button.ts";

  let {
    kind,
    disabled = false,
    onclick,
    children,
  }: {
    kind: StepButtonKind;
    disabled?: boolean;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<Button
  type="button"
  look={kind}
  {disabled}
  class={stepButtonClass(kind)}
  {onclick}
>
  {@render children()}
</Button>
