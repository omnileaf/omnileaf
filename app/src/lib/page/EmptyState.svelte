<script lang="ts">
  import type { Snippet } from "svelte";

  import {
    Empty,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
  } from "#lib/components/ui/empty/index.ts";

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

<Empty
  aria-labelledby={titleId}
  class="flex-1 justify-center px-xl pbe-empty-lift"
>
  <EmptyMedia class="medium:text-accent">
    <Icon size={ICON_SIZE} class="block-empty-icon inline-empty-icon" />
  </EmptyMedia>
  <EmptyTitle id={titleId}>{title}</EmptyTitle>
  <EmptyDescription class="text-callout max-inline-prose"
    >{body}</EmptyDescription
  >
  {@render children?.()}
</Empty>
