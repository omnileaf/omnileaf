<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import type { Glyph } from "#lib/page/glyph.ts";

  import { ALERT_TONES, type AlertTone, setAlertTone } from "./tones.ts";

  const ICON_SIZE = 16;

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
    "grid grid-cols-alert gap-x-md gap-y-2xs rounded-alert border px-lg py-alert-block text-start font-ui wrap-anywhere android:rounded-android-md android:border-transparent android:bg-android-container windows:relative windows:rounded-native-info-bar windows:border-native-info-bar-edge windows:py-native-info-bar-words-block windows:pe-native-info-bar-end windows:min-block-native-info-bar ios-grouped:rounded-ios-cell ios-grouped:border-transparent ios-grouped:bg-ios-cell",
    ALERT_TONES[tone].alert,
    className,
  )}
  {...restProps}
>
  <Icon
    size={ICON_SIZE}
    class={cn(ALERT_TONES[tone].icon, "windows:mbs-2xs")}
  />
  {@render children?.()}
</div>
