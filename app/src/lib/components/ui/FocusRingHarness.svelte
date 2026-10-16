<script lang="ts">
  import { Button } from "./button/index.ts";
  import { Checkbox } from "./checkbox/index.ts";
  import { Slider } from "./slider/index.ts";
</script>

<Button look="outline" type="button">Add a folder</Button>
<Checkbox aria-label="Mark read" />
<Slider aria-label="Brightness" value={60} />
