<script lang="ts">
  import type { LucideProps } from "@lucide/svelte";
  import type { Component } from "svelte";

  import type { IconName } from "#lib/icons/names.ts";

  import type { QuickSettingLook } from "./quick-setting.ts";
  import ReaderIcon from "./ReaderIcon.svelte";

  let {
    name,
    fallback,
    look,
  }: {
    name: IconName;
    fallback: Component<LucideProps>;
    look: QuickSettingLook;
  } = $props();
</script>

{#if !look.hasPill}
  <ReaderIcon
    {name}
    {fallback}
    isKit={look.hasKitIcons}
    size={look.iconSize}
    class="shrink-0"
  />
{:else}
  <span data-pill class={look.pill}>
    <ReaderIcon
      {name}
      {fallback}
      isKit={look.hasKitIcons}
      size={look.iconSize}
      class="shrink-0"
    />
  </span>
{/if}
