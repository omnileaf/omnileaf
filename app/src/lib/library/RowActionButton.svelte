<script lang="ts">
  import type { Snippet } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";

  let {
    label,
    tooltip,
    disabled = false,
    onclick,
    children,
  }: {
    label: string;
    tooltip: string;
    disabled?: boolean;
    onclick: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => void;
    children: Snippet;
  } = $props();
</script>

<Tooltip label={tooltip} type="button" aria-label={label} {disabled} {onclick}>
  {#snippet child({ props })}
    <Button
      {...props}
      look="row-action"
      class="shrink-0 block-touch-target inline-touch-target before:block-pointer-target before:inline-pointer-target"
    >
      {@render children()}
    </Button>
  {/snippet}
</Tooltip>
