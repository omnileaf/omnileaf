<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  interface Option {
    readonly value: string;
    readonly label: string;
  }

  const CHEVRON_SIZE = 17;

  let {
    label,
    options,
    value,
    onChoose,
  }: {
    label: string;
    options: readonly Option[];
    value: string;
    onChoose: (value: string) => void;
  } = $props();

  const valueLabel = $derived(
    options.find((option) => option.value === value)?.label ?? "",
  );
</script>

<div
  class="relative flex items-center gap-native-row-gap py-native-row-block min-block-native-row"
>
  <span
    class="flex-1 text-native-row-title/native-row-title font-native-row-title tracking-native-row-title"
  >
    {label}
  </span>
  <span
    aria-hidden="true"
    class="flex items-center gap-xs text-native-row-title/native-row-title tracking-native-row-title text-muted"
  >
    {valueLabel}
    <ChevronRight size={CHEVRON_SIZE} class="rtl:-scale-x-100" />
  </span>
  <select
    aria-label={label}
    {value}
    class="absolute inset-none opacity-0 block-full inline-full"
    onchange={({
      currentTarget,
    }: Event & { currentTarget: HTMLSelectElement }) => {
      onChoose(currentTarget.value);
    }}
  >
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</div>
