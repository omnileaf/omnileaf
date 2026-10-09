<script lang="ts">
  import type { LucideIcon } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  const ICON_SIZE = 20;

  let {
    icon: Icon,
    title,
    body,
    detail,
    actions,
  }: {
    icon: LucideIcon;
    title: string;
    body: string;
    detail?: string;
    actions: Snippet;
  } = $props();
</script>

<section
  class="mx-auto flex flex-col items-start gap-md pbs-2xl max-inline-problem medium:pbs-3xl expanded:pbs-problem-top"
>
  <div class="flex items-center gap-md">
    <span
      class="flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent block-header-badge inline-header-badge desktop:block-header-badge-desktop desktop:inline-header-badge-desktop"
    >
      <Icon
        aria-hidden="true"
        size={ICON_SIZE}
        class="desktop:block-header-icon-desktop desktop:inline-header-icon-desktop"
      />
    </span>
    <h1 tabindex="-1" class="text-problem-title font-bold tracking-tight">
      {title}
    </h1>
  </div>
  <p class="text-reading text-muted desktop:text-reading-small">{body}</p>
  {#if detail !== undefined}
    <p
      dir="ltr"
      class="self-stretch rounded-card bg-well px-list-row py-md font-mono text-caption break-all select-text"
    >
      {detail}
    </p>
  {/if}
  <div
    class="mbs-sm flex flex-col gap-sm self-stretch medium:flex-row medium:self-start"
  >
    {@render actions()}
  </div>
</section>
