<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import type { Glyph } from "#lib/page/glyph.ts";

  import { ALERT_TONES, type AlertTone, setAlertTone } from "./tones.ts";

  const ICON_SIZE = 20;

  let {
    tone,
    icon: Icon,
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & {
    tone: AlertTone;
    icon: Glyph;
  } = $props();

  setAlertTone(() => tone);
</script>

<div
  data-slot="alert"
  class={cn(
    "grid grid-cols-alert gap-x-md gap-y-xs rounded-alert border px-lg py-alert-block text-start font-ui wrap-anywhere ios-grouped:rounded-ios-cell ios-grouped:border-transparent ios-grouped:bg-ios-cell",
    ALERT_TONES[tone].alert,
    className,
  )}
  {...restProps}
>
  <Icon size={ICON_SIZE} class={ALERT_TONES[tone].icon} />
  {@render children?.()}
</div>
