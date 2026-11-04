<script lang="ts">
  import type { Snippet } from "svelte";

  type Subtitle = string | { readonly phone?: string; readonly tablet: string };

  let {
    title,
    subtitle,
    actions,
  }: { title: string; subtitle?: Subtitle; actions?: Snippet } = $props();

  const SUBTITLE = "mbs-1 text-small text-muted";
</script>

<div
  class="mbe-5 flex flex-col gap-4 tablet:mbe-6 tablet:flex-row tablet:items-end tablet:justify-between"
>
  <div class="min-inline-0">
    <h1 tabindex="-1" class="text-title font-semibold tracking-tight">
      {title}
    </h1>
    {#if typeof subtitle === "string"}
      <p class={SUBTITLE}>{subtitle}</p>
    {:else if subtitle !== undefined}
      {#if subtitle.phone !== undefined}
        <p class="{SUBTITLE} tablet:hidden">{subtitle.phone}</p>
      {/if}
      <p class="{SUBTITLE} hidden tablet:block">{subtitle.tablet}</p>
    {/if}
  </div>
  {@render actions?.()}
</div>
