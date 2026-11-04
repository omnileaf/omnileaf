<script lang="ts">
  import { Label } from "#lib/components/ui/label/index.ts";
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";

  let {
    id,
    label,
    allLabel,
    value,
    choices,
    onSelect,
  }: {
    id: string;
    label: string;
    allLabel: string;
    value: string;
    choices: readonly { value: string; label: string }[];
    onSelect: (value: string) => void;
  } = $props();

  function selected(event: Event & { currentTarget: HTMLSelectElement }): void {
    onSelect(event.currentTarget.value);
  }
</script>

<div class="flex flex-col gap-1.5 min-inline-0">
  <Label for={id}>{label}</Label>
  <NativeSelect {id} {value} class="tablet:inline-42" onchange={selected}>
    <option value="">{allLabel}</option>
    {#each choices as choice (choice.value)}
      <option value={choice.value}>{choice.label}</option>
    {/each}
  </NativeSelect>
</div>
