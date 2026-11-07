<script lang="ts" generics="Choice extends string">
  import type { Snippet } from "svelte";

  import {
    ToggleGroup,
    ToggleGroupItem,
  } from "#lib/components/ui/toggle-group/index.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";

  import type { SettingChoiceControl } from "./setting-choice-control.ts";

  interface ChoiceOption<Value> {
    readonly value: Value;
    readonly label: string;
    readonly phoneLabel?: string;
    readonly disabled?: boolean;
  }

  let {
    label,
    hint,
    choices,
    chosen,
    isStacked = false,
    isInline = false,
    control = "toggle",
    onChoose,
    children,
  }: {
    label: string;
    hint?: string;
    choices: readonly ChoiceOption<Choice>[];
    chosen: Choice;
    isStacked?: boolean;
    isInline?: boolean;
    control?: SettingChoiceControl;
    onChoose: (choice: Choice) => void;
    children?: Snippet;
  } = $props();

  const id = $props.id();
  const isPills = $derived(control === "pills");
  const values = $derived(choices.map((choice) => choice.value));
  const labels = $derived(
    Object.fromEntries(
      choices.map((choice) => [
        choice.value,
        () => choice.phoneLabel ?? choice.label,
      ]),
    ) as Record<Choice, () => string>,
  );
  const disabledValues = $derived(
    choices.filter((choice) => choice.disabled).map((choice) => choice.value),
  );
</script>

<div
  data-slot="setting-row"
  class={[
    "flex flex-col gap-sm py-setting-grid-pad",
    !isPills &&
      (hint !== undefined || isInline) &&
      "grid grid-cols-setting-grid items-center gap-x-md min-block-setting-grid-row",
    !isStacked &&
      !isPills &&
      "expanded:grid expanded:grid-cols-setting-grid expanded:items-center expanded:gap-x-md expanded:min-block-setting-grid-row",
  ]}
>
  {#if hint === undefined}
    <p {id} class="text-small font-medium">{label}</p>
  {:else}
    <div class="flex flex-col gap-2xs">
      <p {id} class="text-small font-medium">{label}</p>
      <p class="text-detail text-muted">{hint}</p>
    </div>
  {/if}
  {#if isPills}
    <SegmentedControl
      options={values}
      {labels}
      {chosen}
      disabledOptions={disabledValues}
      labelledBy={id}
      isFullWidth
      {onChoose}
    />
  {:else}
    <ToggleGroup
      aria-labelledby={id}
      class={[
        hint === undefined && !isInline && "inline-full",
        isInline && "inline-setting-control",
        !isStacked && "expanded:inline-setting-control",
      ]}
      bind:value={
        () => chosen,
        (value: string) => {
          const choice = choices.find((candidate) => candidate.value === value);
          if (choice !== undefined) {
            onChoose(choice.value);
          }
        }
      }
    >
      {#each choices as choice (choice.value)}
        <ToggleGroupItem
          value={choice.value}
          disabled={choice.disabled}
          data-label={choice.phoneLabel === undefined
            ? choice.label
            : undefined}
          class="grow"
        >
          {#if choice.phoneLabel === undefined}
            {choice.label}
          {:else}
            <span
              data-label={choice.phoneLabel}
              class="room-for-semibold-label items-center expanded:hidden"
            >
              {choice.phoneLabel}
            </span>
            <span
              data-label={choice.label}
              class="hidden items-center expanded:room-for-semibold-label"
            >
              {choice.label}
            </span>
          {/if}
        </ToggleGroupItem>
      {/each}
    </ToggleGroup>
  {/if}
  {@render children?.()}
</div>
