<script lang="ts" generics="Option extends string">
  let {
    name,
    options,
    labels,
    chosen,
    labelledBy,
    describedBy,
    onChoose,
  }: {
    name: string;
    options: readonly Option[];
    labels: Record<Option, () => string>;
    chosen: Option;
    labelledBy: string;
    describedBy?: string | undefined;
    onChoose: (option: Option) => void;
  } = $props();
</script>

<div
  role="radiogroup"
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  class="flex gap-2xs rounded-card bg-chip p-2xs touch:medium:max-inline-segmented-touch desktop:max-inline-segmented"
>
  {#each options as option (option)}
    <label
      class={[
        "relative flex flex-1 items-center justify-center rounded-tile text-callout transition-control min-block-option before:absolute before:inset-x-none before:-inset-y-xs has-focus-visible:outline-2 has-focus-visible:outline-accent",
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
      {labels[option]()}
    </label>
  {/each}
</div>
