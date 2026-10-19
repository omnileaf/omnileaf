<script lang="ts" generics="Option extends string">
  import {
    RadioGroup,
    RadioGroupItem,
  } from "#lib/components/ui/radio-group/index.ts";

  let {
    title,
    options,
    labels,
    hints = {},
    chosen,
    onChoose,
  }: {
    title: string;
    options: readonly Option[];
    labels: Record<Option, string>;
    hints?: Partial<Record<Option, string>>;
    chosen: Option;
    onChoose: (option: Option) => void;
  } = $props();

  const id = $props.id();
</script>

<section
  aria-labelledby="{id}-title"
  class="flex flex-col gap-sm rounded-card border border-border bg-card p-list-row"
>
  <h2 id="{id}-title" class="font-semibold">{title}</h2>
  <RadioGroup
    {options}
    {chosen}
    {onChoose}
    aria-labelledby="{id}-title"
    class="flex flex-col divide-y divide-border"
  >
    {#each options as option (option)}
      {@const isChosen = chosen === option}
      {@const hint = hints[option]}
      <RadioGroupItem
        value={option}
        aria-labelledby="{id}-{option}-label"
        aria-describedby={hint === undefined ? undefined : `${id}-${option}`}
        class="flex items-start gap-md rounded-control py-sm text-start transition-control inline-full hover:tint-hover focus-visible:outline-offset-2 active:tint-pressed touch:min-block-touch-target"
      >
        <span
          aria-hidden="true"
          class={[
            "mbs-2xs flex shrink-0 items-center justify-center rounded-full border block-radio inline-radio android:border-2",
            isChosen ? "border-radio-edge-on" : "border-control-edge",
          ]}
        >
          {#if isChosen}
            <span
              class="rounded-full bg-accent block-radio-dot inline-radio-dot"
            ></span>
          {/if}
        </span>
        <span class="flex flex-col gap-2xs">
          <span id="{id}-{option}-label" class="font-medium">
            {labels[option]}
          </span>
          {#if hint !== undefined}
            <span id="{id}-{option}" class="text-footnote text-muted">
              {hint}
            </span>
          {/if}
        </span>
      </RadioGroupItem>
    {/each}
  </RadioGroup>
</section>
