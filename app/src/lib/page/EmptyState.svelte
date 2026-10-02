<script lang="ts">
  import type { LucideIcon } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  let {
    icon: Icon,
    title,
    body,
    children,
  }: {
    icon: LucideIcon;
    title: string;
    body: string;
    children?: Snippet;
  } = $props();

  const ICON_SIZE = 28;

  const titleId = $props.id();
</script>

<section
  aria-labelledby={titleId}
  class="flex flex-1 flex-col items-center justify-center gap-md px-xl pbe-3xl text-center"
>
  <span
    class="flex items-center justify-center rounded-full bg-accent-soft block-4xl inline-4xl"
  >
    <Icon size={ICON_SIZE} aria-hidden="true" />
  </span>
  <h2 id={titleId} class="mbs-sm text-title font-bold">{title}</h2>
  <p class="text-callout text-muted max-inline-prose">{body}</p>
  {@render children?.()}
</section>
