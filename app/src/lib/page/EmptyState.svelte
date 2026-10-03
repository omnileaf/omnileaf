<script lang="ts">
  import type { Snippet } from "svelte";

  import type { Glyph } from "./glyph";

  let {
    icon: Icon,
    title,
    body,
    children,
  }: {
    icon: Glyph;
    title: string;
    body: string;
    children?: Snippet;
  } = $props();

  const ICON_SIZE = 28;

  const titleId = $props.id();
</script>

<section
  aria-labelledby={titleId}
  class="flex flex-1 flex-col items-center justify-center gap-md px-xl pbe-empty-lift text-center"
>
  <span
    class="flex items-center justify-center rounded-full bg-accent-soft block-empty-art inline-empty-art medium:text-accent"
  >
    <Icon size={ICON_SIZE} class="block-empty-icon inline-empty-icon" />
  </span>
  <h2 id={titleId} class="mbs-sm text-title font-bold">{title}</h2>
  <p class="text-callout text-muted max-inline-prose">{body}</p>
  {@render children?.()}
</section>
