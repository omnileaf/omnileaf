<script lang="ts">
  import type { Snippet } from "svelte";

  import { currentPlatform } from "#lib/page/platform.ts";

  import { usesSetupPages } from "./setup-pages.ts";

  const SCALES = {
    welcome: "text-welcome-title",
    step: "text-headline",
  } as const;

  let {
    scale = "step",
    badge,
    children,
    lead,
  }: {
    scale?: keyof typeof SCALES;
    badge: Snippet;
    children: Snippet;
    lead: Snippet;
  } = $props();

  const isSetupPage = usesSetupPages(currentPlatform());
</script>

<div
  class={[
    "flex flex-col",
    isSetupPage ? "items-start gap-sm" : "gap-step-intro text-center",
  ]}
>
  <div class={["flex", !isSetupPage && "justify-center"]}>
    {@render badge()}
  </div>
  <h1
    tabindex="-1"
    class={[
      "wrap-break-word",
      isSetupPage
        ? "text-welcome-title font-semibold"
        : ["font-bold tracking-tight", SCALES[scale]],
    ]}
  >
    {@render children()}
  </h1>
  <p
    class={[
      "wrap-break-word text-muted",
      isSetupPage ? "text-label" : "text-step-body",
    ]}
  >
    {@render lead()}
  </p>
</div>
