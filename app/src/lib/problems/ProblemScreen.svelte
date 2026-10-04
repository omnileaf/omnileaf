<script lang="ts">
  import type { LucideIcon } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  const ICON_SIZE = 28;

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
  <span class="flex items-center justify-center rounded-panel bg-chip p-lg">
    <Icon aria-hidden="true" size={ICON_SIZE} />
  </span>
  <h1 tabindex="-1" class="text-headline font-bold">
    {title}
  </h1>
  <p class="text-muted">{body}</p>
  {#if detail !== undefined}
    <p
      dir="ltr"
      class="self-stretch rounded-card bg-chip p-md font-mono text-caption break-all"
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
