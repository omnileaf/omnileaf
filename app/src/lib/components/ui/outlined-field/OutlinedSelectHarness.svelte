<script lang="ts">
  import { OutlinedSelect } from "./index.ts";
</script>

<div class="bg-background p-lg">
  <OutlinedSelect
    label="Reading mode"
    choices={[
      { value: "paged", label: "Paged" },
      { value: "longStrip", label: "Long strip" },
    ]}
    value="paged"
    onChoose={() => undefined}
  />
</div>
