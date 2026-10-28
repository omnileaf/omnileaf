<script lang="ts">
  import type { Snippet } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { usesSetupPages } from "./setup-pages.ts";
  import {
    setupVariantOf,
    stepButtonClass,
    type StepButtonKind,
  } from "./step-button.ts";

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

  const platform = currentPlatform();
  const isSetupPage = usesSetupPages(platform);
  const classes = $derived(stepButtonClass(kind, platform));

  function click(): void {
    if (!isBusy) {
      onclick();
    }
  }
</script>

{#if isSetupPage}
  <Button
    type="button"
    variant={setupVariantOf(kind)}
    {disabled}
    aria-disabled={isBusy || undefined}
    class={classes}
    onclick={click}
  >
    {@render children()}
  </Button>
{:else}
  <Button
    type="button"
    look={kind}
    {disabled}
    aria-disabled={isBusy || undefined}
    class={classes}
    onclick={click}
  >
    {@render children()}
  </Button>
{/if}
