<script lang="ts">
  import { NativeSelect } from "./index.ts";

  let value = $state("day");
</script>

<NativeSelect
  aria-label="Rescan folders"
  choices={[
    { value: "day", label: "Every day" },
    { value: "week", label: "Every week" },
  ]}
  {value}
  onChoose={(picked: string) => {
    value = picked;
  }}
/>
