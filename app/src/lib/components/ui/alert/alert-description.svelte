<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { ALERT_TONES, getAlertTone } from "./tones.ts";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLParagraphElement> = $props();

  const tone = getAlertTone();
</script>

<p
  data-slot="alert-description"
  class={cn(
    "col-start-2 text-label",
    ALERT_TONES[tone()].description,
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</p>
