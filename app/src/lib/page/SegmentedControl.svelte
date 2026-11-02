<script lang="ts" generics="Option extends string">
  import type { LucideProps } from "@lucide/svelte";
  import type { Component, Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import {
    RadioGroup,
    RadioGroupItem,
  } from "#lib/components/ui/radio-group/index.ts";

  import { currentPlatform, hasNativeLook } from "./platform";
  import { followFittingColumns } from "./segment-columns";
  import SegmentFace from "./SegmentFace.svelte";

  type Size = "small" | "regular";

  interface Props {
    readonly options: readonly Option[];
    readonly labels: Record<Option, () => string>;
    readonly icons?: Record<Option, Component<LucideProps>> | undefined;
    readonly chosen: Option;
    readonly labelledBy: string;
    readonly describedBy?: string | undefined;
    readonly size?: Size;
    readonly isFullWidth?: boolean;
    readonly isSetupRow?: boolean;
    readonly hasWindowsLook?: boolean;
    readonly hasEqualColumns?: boolean;
    readonly onChoose: (option: Option) => void;
    readonly onFit?: ((isOneRow: boolean) => void) | undefined;
    readonly class?: ClassValue;
    readonly segmentClass?: ClassValue;
    readonly crowded?: Snippet | undefined;
  }

  const LOOKS = {
    small: {
      track:
        "gap-xs rounded-field p-xs large:rounded-small-control large:p-segment-track",
      capped: "",
      segment: "rounded-small-control min-block-segment large:rounded-segment",
      onRow: "flex-auto desktop:large:min-block-segment-compact",
      face: "gap-icon-gap px-sm text-detail large:text-caption",
      icon: "large:block-segment-icon-desktop large:inline-segment-icon-desktop",
    },
    regular: {
      track: "gap-2xs rounded-card p-2xs",
      capped:
        "touch:medium:max-inline-segmented-touch desktop:max-inline-segmented",
      segment: "rounded-tile min-block-option",
      onRow: "flex-1",
      face: "text-callout",
      icon: "",
    },
  } satisfies Record<
    Size,
    Record<"track" | "capped" | "segment" | "onRow" | "face" | "icon", string>
  >;

  const NATIVE_LOOK = {
    track:
      "gap-native-segmented-gap rounded-native-segmented bg-native-segmented-track p-native-segmented-inset",
    segment:
      "rounded-native-segment min-block-native-segment first-of-type:rounded-s-native-segment-end last-of-type:rounded-e-native-segment-end",
    face: "gap-sm px-native-segment-inline text-native-segment leading-native-segment tracking-native-segment",
    chosen:
      "rounded-native-segment-selected bg-native-segment-selected font-native-segment-selected text-native-on-segment-selected shadow-native-segment-lift",
    unchosen:
      "bg-native-segment-fill font-native-segment text-native-on-segment",
  };

  const MACOS_SMALL = {
    track: "min-block-native-button-small rounded-native-button-small",
    segment:
      "min-block-native-button-small px-sm text-native-button-small leading-native-button-small",
    corners:
      "rounded-native-button-small first-of-type:rounded-s-native-button-small last-of-type:rounded-e-native-button-small",
  };

  const EQUAL_COLUMNS = {
    track: "grid-flow-col auto-cols-fr",
    segment: "min-inline-none",
  };

  const WINDOWS_LOOK = {
    track:
      "gap-px rounded-windows-control border border-windows-stroke bg-native-segmented-track",
    segment:
      "rounded-windows-control border border-transparent min-block-segment-item",
    face: "px-md text-label",
    chosen:
      "border-windows-stroke bg-native-segment-selected text-native-on-segment-selected after:absolute after:inset-be-none after:inset-s-1/2 after:-translate-x-1/2 after:rounded-full after:bg-windows-accent after:block-windows-indicator after:inline-windows-indicator-length forced-colors:after:bg-native-on-segment-selected rtl:after:translate-x-1/2",
    unchosen: "text-foreground hover:bg-hover",
  };

  let {
    options,
    labels,
    icons,
    chosen,
    labelledBy,
    describedBy,
    size = "regular",
    isFullWidth = false,
    isSetupRow = false,
    hasWindowsLook = false,
    hasEqualColumns = false,
    onChoose,
    onFit,
    class: className,
    segmentClass,
    crowded,
  }: Props = $props();

  const look = $derived(LOOKS[size]);
  const platform = currentPlatform();
  const isNative = hasNativeLook(platform);
  const isMacos = platform === "macos";
  const isMacosSmall = $derived(isMacos && size === "small");
  const usesNativeTokens = isNative || isMacos;
  const hasEqualMacosColumns = $derived(isMacos && hasEqualColumns);
  const isWindows = $derived(
    platform === "windows" &&
      (hasWindowsLook || (size === "regular" && isSetupRow)),
  );
  const face = $derived.by(() => {
    if (isWindows) {
      return WINDOWS_LOOK.face;
    }
    if (isMacosSmall) {
      return "";
    }
    return usesNativeTokens && size === "regular"
      ? NATIVE_LOOK.face
      : look.face;
  });

  function onRowOf(): string {
    if (hasEqualMacosColumns) {
      return EQUAL_COLUMNS.segment;
    }
    return isMacosSmall ? "flex-auto" : look.onRow;
  }

  let track = $state<HTMLElement | null>(null);
  let ruler: HTMLElement | undefined = $state();
  let fittedColumns: number | undefined = $state();
  const columns = $derived(fittedColumns ?? options.length);
  const isOneRow = $derived(columns === options.length);
  const isCrowded = $derived(crowded !== undefined && !isOneRow);

  $effect(() => {
    if (track === null || ruler === undefined) {
      return;
    }
    return followFittingColumns(track, ruler, (fitted) => {
      fittedColumns = fitted;
    });
  });

  $effect(() => {
    if (fittedColumns !== undefined) {
      onFit?.(isOneRow);
    }
  });
</script>

<RadioGroup
  bind:ref={track}
  {options}
  {chosen}
  {onChoose}
  orientation="horizontal"
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  style={isOneRow
    ? undefined
    : `grid-template-columns: repeat(${String(columns)}, minmax(0, 1fr))`}
  class={[
    isCrowded ? "invisible absolute inset-x-none" : "relative",
    isOneRow && !hasEqualMacosColumns ? "flex" : "grid",
    hasEqualMacosColumns && isOneRow && EQUAL_COLUMNS.track,
    usesNativeTokens
      ? [NATIVE_LOOK.track, isMacosSmall && MACOS_SMALL.track]
      : isWindows
        ? WINDOWS_LOOK.track
        : ["bg-chip", look.track],
    !isFullWidth && look.capped,
    className,
  ]}
>
  {#each options as option (option)}
    <RadioGroupItem
      value={option}
      class={[
        "relative flex items-center justify-center transition-control",
        isNative
          ? "native-target"
          : "before:absolute before:inset-x-none before:-inset-y-xs",
        isMacos && "segment-divider focus-visible:outline-offset-1",
        isMacos && chosen !== option && "hover:bg-native-control-fill-hover",
        usesNativeTokens
          ? [NATIVE_LOOK.segment, isMacosSmall && MACOS_SMALL.segment]
          : isWindows
            ? WINDOWS_LOOK.segment
            : look.segment,
        face,
        isOneRow
          ? [onRowOf(), "text-nowrap"]
          : "min-inline-none touch:min-block-touch-target",
        usesNativeTokens
          ? chosen === option
            ? NATIVE_LOOK.chosen
            : NATIVE_LOOK.unchosen
          : isWindows
            ? chosen === option
              ? WINDOWS_LOOK.chosen
              : WINDOWS_LOOK.unchosen
            : chosen === option
              ? "bg-raised font-semibold text-foreground shadow-raised"
              : "font-medium text-foreground hover:bg-hover",
        isMacosSmall && MACOS_SMALL.corners,
        segmentClass,
      ]}
    >
      <SegmentFace
        label={labels[option]()}
        icon={icons?.[option]}
        iconClass={look.icon}
        isShown
      />
    </RadioGroupItem>
  {/each}
  <span
    bind:this={ruler}
    aria-hidden="true"
    class="invisible absolute inset-x-none inset-bs-none flex overflow-hidden block-none"
  >
    {#each options as option (option)}
      <span
        class={[
          "flex flex-none items-center",
          face,
          isMacosSmall && MACOS_SMALL.segment,
          segmentClass,
        ]}
      >
        <SegmentFace
          label={labels[option]()}
          icon={icons?.[option]}
          iconClass={look.icon}
          isShown={false}
        />
      </span>
    {/each}
  </span>
</RadioGroup>
{#if isCrowded}
  {@render crowded?.()}
{/if}
