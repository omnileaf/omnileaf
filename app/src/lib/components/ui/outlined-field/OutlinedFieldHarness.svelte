<script lang="ts">
  import OutlinedField from "./outlined-field.svelte";
  import { OUTLINED_FIELD_CONTROL } from "./looks.ts";
</script>

<div class="bg-background p-lg">
  <OutlinedField label="Title" labelFor="field">
    <input id="field" value="Harbour" class={OUTLINED_FIELD_CONTROL} />
  </OutlinedField>
</div>
