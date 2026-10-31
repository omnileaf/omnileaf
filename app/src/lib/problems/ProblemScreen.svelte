<script lang="ts">
  import type { LucideIcon } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { currentPlatform } from "#lib/page/platform.ts";
  import { problemLook } from "#lib/page/problem-look.ts";

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

  const look = problemLook(currentPlatform());
</script>

<section class={["mx-auto flex flex-col items-start", look.section]}>
  <div class="flex items-center gap-md">
    <span class={["flex shrink-0 items-center justify-center", look.icon]}>
      <Icon aria-hidden="true" size={look.iconSize} class={look.glyph} />
    </span>
    <h1 tabindex="-1" class={look.title}>
      {title}
    </h1>
  </div>
  <p class={look.body}>{body}</p>
  {#if detail !== undefined}
    <p dir="ltr" class={["self-stretch", look.detail]}>
      {detail}
    </p>
  {/if}
  <div class={["mbs-sm flex", look.actions]}>
    {@render actions()}
  </div>
</section>
