<script lang="ts">
  import type { LucideProps } from "@lucide/svelte";
  import type { Component } from "svelte";

  const ICON_SIZE = 16;

  let {
    label,
    icon: Icon,
    iconClass,
    isShown,
  }: {
    label: string;
    icon: Component<LucideProps> | undefined;
    iconClass: string;
    isShown: boolean;
  } = $props();
</script>

{#if Icon !== undefined}
  <Icon size={ICON_SIZE} aria-hidden="true" class="shrink-0 {iconClass}" />
{/if}
<span class="grid text-center wrap-break-word min-inline-none">
  <span
    aria-hidden="true"
    class="invisible col-start-1 row-start-1 font-semibold"
  >
    {label}
  </span>
  {#if isShown}
    <span class="col-start-1 row-start-1">{label}</span>
  {/if}
</span>
