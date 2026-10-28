<script lang="ts">
  import type { Snippet } from "svelte";

  import {
    Empty,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
  } from "#lib/components/ui/empty/index.ts";
  import { emptyLook } from "#lib/components/ui/empty/looks.ts";

  import type { Glyph } from "./glyph";
  import { currentPlatform } from "./platform";

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
  const look = emptyLook(currentPlatform());
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
  <EmptyDescription class={["text-small", look.prose]}>{body}</EmptyDescription>
  {@render children?.()}
</Empty>
