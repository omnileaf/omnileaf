<script lang="ts">
  import type { LucideProps } from "@lucide/svelte";
  import type { Component } from "svelte";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { IconName } from "#lib/icons/names.ts";

  let {
    name,
    fallback: Fallback,
    isKit,
    size,
    kitSize,
    isFilled = false,
    class: className = "",
  }: {
    name: IconName;
    fallback: Component<LucideProps>;
    isKit: boolean;
    size: number;
    kitSize?: number | undefined;
    isFilled?: boolean;
    class?: string;
  } = $props();
</script>

{#if isKit}
  <Icon {name} size={kitSize} class={className} />
{:else}
  <Fallback
    {size}
    aria-hidden="true"
    fill={isFilled ? "currentColor" : "none"}
    class={className}
  />
{/if}
