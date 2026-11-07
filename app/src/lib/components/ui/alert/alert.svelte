<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { ALERT_TONES, type AlertTone, setAlertTone } from "./tones.ts";

  const ICON_SIZE = 16;
  const isAndroid = currentPlatform() === "android";

  let {
    tone,
    icon: Shape,
    iconName,
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & {
    tone: AlertTone;
    icon: Glyph;
    iconName: IconName;
  } = $props();

  setAlertTone(() => tone);
</script>

<div
  data-slot="alert"
  class={cn(
    "group/alert grid grid-cols-alert gap-x-md gap-y-2xs rounded-alert border px-lg py-alert-block text-start font-ui wrap-anywhere android:relative android:gap-x-lg android:rounded-android-md android:border-0 android:p-lg windows:relative windows:rounded-native-info-bar windows:border-native-info-bar-edge windows:py-native-info-bar-words-block windows:pe-native-info-bar-end windows:min-block-native-info-bar ios-grouped:rounded-ios-cell ios-grouped:border-transparent ios-grouped:bg-ios-cell",
    ALERT_TONES[tone].alert,
    className,
  )}
  {...restProps}
>
  {#if isAndroid}
    <Icon name={iconName} class={ALERT_TONES[tone].icon} />
  {:else}
    <Shape
      size={ICON_SIZE}
      class={cn(ALERT_TONES[tone].icon, "windows:mbs-2xs")}
    />
  {/if}
  {@render children?.()}
</div>
