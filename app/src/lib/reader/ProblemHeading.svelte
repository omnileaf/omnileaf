<script lang="ts">
  import type { FileX } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { EmptyMedia } from "#lib/components/ui/empty/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";

  import { PROBLEM_HEAD, problemLayout } from "./problem-heading.ts";

  const HEADING_ICON_SIZE = 20;

  let {
    icon: Icon,
    platform,
    children,
  }: { icon: typeof FileX; platform: Platform; children: Snippet } = $props();

  const width = new WindowWidth();
  const layout = $derived(problemLayout(platform, width.current));
</script>

<div class={PROBLEM_HEAD[layout]}>
  <EmptyMedia class="shrink-0">
    <Icon size={HEADING_ICON_SIZE} aria-hidden="true" />
  </EmptyMedia>
  <h1
    tabindex="-1"
    class="text-group-title font-semibold tracking-tight text-pretty expanded:text-body"
  >
    {@render children()}
  </h1>
</div>
