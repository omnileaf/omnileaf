<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { ALERT_TONES, getAlertTone } from "./tones.ts";

  const BUTTON =
    "rounded-full px-lg text-detail font-bold transition-control min-block-touch-target focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 medium:rounded-control desktop:rounded-control desktop:px-md desktop:min-block-compact-button";
  const QUIET =
    "border border-current/35 enabled:hover:bg-hover enabled:active:bg-pressed";
  const STRONG = "enabled:hover:opacity-85 enabled:active:opacity-70";

  let {
    emphasis,
    class: className,
    children,
    ...restProps
  }: HTMLButtonAttributes & { emphasis: "strong" | "quiet" } = $props();

  const tone = getAlertTone();
</script>

<button
  type="button"
  class={cn(
    BUTTON,
    emphasis === "strong" ? [ALERT_TONES[tone()].strongAction, STRONG] : QUIET,
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</button>
