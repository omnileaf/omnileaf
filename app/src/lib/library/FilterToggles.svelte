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

  const DEFAULT_CHIP =
    "flex shrink-0 items-center gap-xs rounded-control border px-md text-small font-medium whitespace-nowrap block-search-chip ios:max-medium:rounded-full ios:max-medium:border-0 ios:max-medium:block-native-segment touch:touch-target-around";
  const DEFAULT_CHIP_CHOSEN =
    "border-transparent bg-chip ios:max-medium:bg-native-accent-soft ios:max-medium:font-semibold ios:max-medium:text-foreground";
  const DEFAULT_CHIP_OTHER =
    "border-border bg-card hover:bg-hover ios:max-medium:bg-native-button-outline ios:max-medium:hover:bg-native-button-outline";

  function labelClassOf(): string {
    if (isInspector) {
      return MAC_INSPECTOR.label;
    }
    return isAndroidPhone
      ? FILTER_SETTING_LABEL_TYPE
      : "text-small font-medium";
  }

  function groupClassOf(): string {
    return isInspector ? MAC_INSPECTOR_CHIP.group : "flex flex-wrap gap-sm";
  }

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
    return [DEFAULT_CHIP, isChosen ? DEFAULT_CHIP_CHOSEN : DEFAULT_CHIP_OTHER];
  }
</script>

<div
  class={[
    "flex flex-col gap-sm",
    !isInspector && "py-setting-grid-pad",
    isAndroidPhone && "ps-lg pe-xl",
  ]}
>
  <p {id} class={labelClassOf()}>
    {label}
  </p>
  <div role="group" aria-labelledby={id} class={groupClassOf()}>
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
            size={isInspector ? MAC_INSPECTOR_CHIP.iconSize : CHECK_SIZE}
            aria-hidden="true"
          />
        {/if}
        {option.label}
      </Toggle.Root>
    {/each}
    {@render children?.()}
  </div>
</div>
