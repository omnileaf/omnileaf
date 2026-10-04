<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import SwitchTrack from "./SwitchTrack.svelte";

  type Prominence = "main" | "option";

  interface Props {
    readonly label: string;
    readonly description: string;
    readonly isOn: boolean;
    readonly onToggle: () => void;
    readonly prominence?: Prominence;
    readonly trailing?: Snippet;
    readonly class?: ClassValue;
  }

  let {
    label,
    description,
    isOn,
    onToggle,
    prominence = "option",
    trailing,
    class: className,
  }: Props = $props();

  const LABEL_WEIGHT = {
    main: "font-semibold expanded:font-bold",
    option: "font-medium expanded:font-semibold",
  } satisfies Record<Prominence, string>;

  const isDescriptionHighlighted = $derived(prominence === "main" && isOn);
  const id = $props.id();
</script>

<button
  type="button"
  role="switch"
  aria-checked={isOn}
  aria-labelledby="{id}-label"
  aria-describedby="{id}-description"
  class={[
    "flex items-center gap-md px-lg py-md text-start inline-full min-block-touch-target focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
    className,
  ]}
  onclick={onToggle}
>
  <span class="flex flex-1 flex-col gap-2xs">
    <span id="{id}-label" class={LABEL_WEIGHT[prominence]}>{label}</span>
    <span
      id="{id}-description"
      class={[
        "text-detail",
        isDescriptionHighlighted ? "font-semibold text-accent" : "text-muted",
      ]}>{description}</span
    >
  </span>
  {@render trailing?.()}
  <SwitchTrack {isOn} />
</button>
