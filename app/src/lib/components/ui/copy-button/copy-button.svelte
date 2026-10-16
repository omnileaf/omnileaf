<script lang="ts" module>
  export type CopyLabels = Readonly<
    Record<"copy" | "copied" | "copiedStatus", string>
  >;
</script>

<script lang="ts">
  import { Check, Copy } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { Button, type ButtonLook } from "#lib/components/ui/button/index.ts";
  import type { DetailsCopying } from "#lib/copying/details-copying.svelte.ts";

  let {
    copying,
    look,
    labels,
    iconSize,
    hidesLabel = false,
    class: className,
  }: {
    copying: DetailsCopying;
    look: ButtonLook;
    labels: CopyLabels;
    iconSize?: number;
    hidesLabel?: boolean;
    class?: ClassValue;
  } = $props();

  const isCopied = $derived(copying.outcome === "copied");
</script>

<Button
  type="button"
  {look}
  class={className}
  onclick={() => {
    void copying.copy();
  }}
>
  {#if iconSize !== undefined}
    {@const Icon = isCopied ? Check : Copy}
    <Icon size={iconSize} class="shrink-0" />
  {/if}
  <span class={[hidesLabel && "sr-only"]}
    >{isCopied ? labels.copied : labels.copy}</span
  >
</Button>
<span role="status" class="sr-only">
  {#if isCopied}
    {labels.copiedStatus}
  {/if}
</span>
