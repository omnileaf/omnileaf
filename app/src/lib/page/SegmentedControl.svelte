<script lang="ts" generics="Option extends string">
  import type { LucideProps } from "@lucide/svelte";
  import type { Component } from "svelte";
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
    readonly onChoose: (option: Option) => void;
    readonly class?: ClassValue;
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

  let {
    options,
    labels,
    icons,
    chosen,
    labelledBy,
    describedBy,
    size = "regular",
    isFullWidth = false,
    onChoose,
    class: className,
  }: Props = $props();

  const look = $derived(LOOKS[size]);
  const isNative = hasNativeLook(currentPlatform());
  const face = $derived(
    isNative && size === "regular" ? NATIVE_LOOK.face : look.face,
  );

  let track = $state<HTMLElement | null>(null);
  let ruler: HTMLElement | undefined = $state();
  let fittedColumns: number | undefined = $state();
  const columns = $derived(fittedColumns ?? options.length);
  const isOneRow = $derived(columns === options.length);

  $effect(() => {
    if (track === null || ruler === undefined) {
      return;
    }
    return followFittingColumns(track, ruler, (fitted) => {
      fittedColumns = fitted;
    });
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
    "relative",
    isOneRow ? "flex" : "grid",
    isNative ? NATIVE_LOOK.track : ["bg-chip", look.track],
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
        isNative ? NATIVE_LOOK.segment : look.segment,
        face,
        isOneRow
          ? [look.onRow, "text-nowrap"]
          : "min-inline-none touch:min-block-touch-target",
        isNative
          ? chosen === option
            ? NATIVE_LOOK.chosen
            : NATIVE_LOOK.unchosen
          : chosen === option
            ? "bg-raised font-semibold text-foreground shadow-raised"
            : "font-medium text-foreground hover:bg-hover",
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
      <span class={["flex flex-none items-center", face]}>
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
