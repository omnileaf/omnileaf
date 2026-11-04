<script lang="ts">
  import { NativeSelect } from "./index.ts";

  let { value }: { value: string } = $props();
</script>

<NativeSelect id="status" {value}>
  <option value="reviewing">Reviewing</option>
  <option value="closed">Closed</option>
</NativeSelect>
