<script lang="ts" generics="Option extends string">
  import type { LucideProps } from "@lucide/svelte";
  import type { Component } from "svelte";
  import type { ClassValue } from "svelte/elements";

  type Size = "small" | "regular";

  interface Props {
    readonly name: string;
    readonly options: readonly Option[];
    readonly labels: Record<Option, () => string>;
    readonly icons?: Record<Option, Component<LucideProps>> | undefined;
    readonly chosen: Option;
    readonly labelledBy: string;
    readonly describedBy?: string | undefined;
    readonly size?: Size;
    readonly onChoose: (option: Option) => void;
    readonly class?: ClassValue;
  }

  const ICON_SIZE = 16;

  const LOOKS = {
    small: {
      track:
        "gap-xs rounded-field p-xs large:rounded-small-control large:p-segment-track",
      segment:
        "flex-auto gap-icon-gap rounded-small-control px-sm text-detail block-segment min-inline-none large:rounded-segment large:text-caption large:block-segment-compact",
      text: "truncate",
      icon: "large:block-segment-icon-desktop large:inline-segment-icon-desktop",
    },
    regular: {
      track:
        "gap-2xs rounded-card p-2xs touch:medium:max-inline-segmented-touch desktop:max-inline-segmented",
      segment: "flex-1 rounded-tile text-callout min-block-option",
      text: "",
      icon: "",
    },
  } satisfies Record<
    Size,
    Record<"track" | "segment" | "text" | "icon", string>
  >;

  let {
    name,
    options,
    labels,
    icons,
    chosen,
    labelledBy,
    describedBy,
    size = "regular",
    onChoose,
    class: className,
  }: Props = $props();

  const look = $derived(LOOKS[size]);
</script>

<div
  role="radiogroup"
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  class={["flex bg-chip", look.track, className]}
>
  {#each options as option (option)}
    {@const Icon = icons?.[option]}
    <label
      class={[
        "relative flex items-center justify-center transition-control before:absolute before:inset-x-none before:-inset-y-xs has-focus-visible:outline-2 has-focus-visible:outline-accent",
        look.segment,
        chosen === option
          ? "bg-raised font-semibold text-foreground shadow-raised"
          : "font-medium text-muted hover:bg-hover",
      ]}
    >
      <input
        type="radio"
        {name}
        value={option}
        class="sr-only"
        checked={chosen === option}
        onchange={() => {
          onChoose(option);
        }}
      />
      {#if Icon !== undefined}
        <Icon size={ICON_SIZE} aria-hidden="true" class={look.icon} />
      {/if}
      <span class="grid min-inline-none">
        <span
          aria-hidden="true"
          class={["invisible col-start-1 row-start-1 font-semibold", look.text]}
        >
          {labels[option]()}
        </span>
        <span class={["col-start-1 row-start-1", look.text]}>
          {labels[option]()}
        </span>
      </span>
    </label>
  {/each}
</div>
