<script lang="ts" generics="Value extends string">
  import { Check } from "@lucide/svelte";
  import { Toggle } from "bits-ui";
  import type { Snippet } from "svelte";

  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";

  import {
    ANDROID_FILTER_CHIP,
    FILTER_SETTING_LABEL_TYPE,
    MAC_INSPECTOR,
    MAC_INSPECTOR_CHIP,
  } from "./filter-sheet-look";

  interface ToggleOption {
    readonly value: Value;
    readonly label: string;
  }

  const CHECK_SIZE = 14;

  let {
    label,
    options,
    chosen,
    isInspector = false,
    onToggle,
    children,
  }: {
    label: string;
    options: readonly ToggleOption[];
    chosen: readonly Value[];
    isInspector?: boolean;
    onToggle: (value: Value) => void;
    children?: Snippet;
  } = $props();

  const id = $props.id();
  const width = new WindowWidth();
  const isAndroidPhone = $derived(
    phoneOf(currentPlatform(), width.current) === "android",
  );

  const TODAYS_CHIP =
    "flex shrink-0 items-center gap-xs rounded-control border px-md text-small font-medium whitespace-nowrap block-search-chip ios:max-medium:rounded-full ios:max-medium:border-0 ios:max-medium:block-native-segment touch:touch-target-around";
  const TODAYS_CHIP_CHOSEN =
    "border-transparent bg-chip ios:max-medium:bg-native-accent-soft ios:max-medium:font-semibold ios:max-medium:text-foreground";
  const TODAYS_CHIP_OTHER =
    "border-border bg-card hover:bg-hover ios:max-medium:bg-native-button-outline ios:max-medium:hover:bg-native-button-outline";

  function chipClassOf(isChosen: boolean): string[] {
    if (isInspector) {
      return [
        MAC_INSPECTOR_CHIP.chip,
        isChosen ? MAC_INSPECTOR_CHIP.chosen : MAC_INSPECTOR_CHIP.other,
      ];
    }
    if (isAndroidPhone) {
      return [
        ANDROID_FILTER_CHIP.chip,
        isChosen ? ANDROID_FILTER_CHIP.chosen : ANDROID_FILTER_CHIP.other,
      ];
    }
    return [TODAYS_CHIP, isChosen ? TODAYS_CHIP_CHOSEN : TODAYS_CHIP_OTHER];
  }
</script>

<div
  class={[
    "flex flex-col gap-sm",
    !isInspector && "py-setting-grid-pad",
    isAndroidPhone && "ps-lg pe-xl",
  ]}
>
  <p
    {id}
    class={isInspector
      ? MAC_INSPECTOR.label
      : isAndroidPhone
        ? FILTER_SETTING_LABEL_TYPE
        : "text-small font-medium"}
  >
    {label}
  </p>
  <div
    role="group"
    aria-labelledby={id}
    class={isInspector ? MAC_INSPECTOR_CHIP.group : "flex flex-wrap gap-sm"}
  >
    {#each options as option (option.value)}
      {@const isChosen = chosen.includes(option.value)}
      <Toggle.Root
        bind:pressed={
          () => isChosen,
          () => {
            onToggle(option.value);
          }
        }
        class={chipClassOf(isChosen)}
      >
        {#if isChosen}
          <Check
            size={isInspector ? MAC_INSPECTOR_CHIP.checkSize : CHECK_SIZE}
            aria-hidden="true"
          />
        {/if}
        {option.label}
      </Toggle.Root>
    {/each}
    {@render children?.()}
  </div>
</div>
