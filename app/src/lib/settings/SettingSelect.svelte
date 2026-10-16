<script lang="ts">
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";

  interface Option {
    readonly value: string;
    readonly label: string;
  }

  interface Props {
    readonly label: string;
    readonly options: readonly Option[];
    readonly value: string;
    readonly onChoose: (value: string) => void;
  }

  let { label, options, value, onChoose }: Props = $props();

  const id = $props.id();
  const labelId = `${id}-label`;
</script>

<div
  class="flex flex-col gap-sm px-lg py-md desktop:grid desktop:grid-cols-setting-grid desktop:items-center desktop:gap-x-md desktop:py-setting-grid-pad desktop:min-block-setting-grid-row"
>
  <span id={labelId} class="font-medium">{label}</span>
  <NativeSelect
    aria-labelledby={labelId}
    {value}
    class="desktop:inline-setting-control"
    fieldClass="touch:text-body touch:block-touch-target"
    onchange={({
      currentTarget,
    }: Event & { currentTarget: HTMLSelectElement }) => {
      onChoose(currentTarget.value);
    }}
  >
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </NativeSelect>
</div>
