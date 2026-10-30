<script lang="ts">
  import type { FileX } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { EmptyMedia } from "#lib/components/ui/empty/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { problemLook } from "#lib/page/problem-look.ts";

  import { PROBLEM_HEAD, problemLayout } from "./problem-heading.ts";

  let {
    icon: Icon,
    platform,
    children,
  }: { icon: typeof FileX; platform: Platform; children: Snippet } = $props();

  const width = new WindowWidth();
  const layout = $derived(problemLayout(platform, width.current));
  const look = $derived(problemLook(platform));
</script>

<div class={PROBLEM_HEAD[layout]}>
  <EmptyMedia class={["shrink-0", look.media]}>
    <Icon size={look.iconSize} aria-hidden="true" />
  </EmptyMedia>
  <h1 tabindex="-1" class={["text-pretty", look.bookTitle]}>
    {@render children()}
  </h1>
</div>
