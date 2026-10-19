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
    role,
    children,
  }: {
    icon: Glyph;
    title: string;
    body: string;
    role?: "alert";
    children?: Snippet;
  } = $props();

  const ICON_SIZE = 24;

  const titleId = $props.id();
</script>

<Empty
  aria-labelledby={titleId}
  {role}
  class="flex-1 justify-center px-xl pbe-empty-lift"
>
  <EmptyMedia>
    <Icon size={ICON_SIZE} class="block-empty-icon inline-empty-icon" />
  </EmptyMedia>
  <EmptyTitle id={titleId}>{title}</EmptyTitle>
  <EmptyDescription class="text-small max-inline-prose">{body}</EmptyDescription
  >
  {@render children?.()}
</Empty>
