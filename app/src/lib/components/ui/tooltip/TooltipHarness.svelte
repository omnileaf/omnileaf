<script lang="ts">
  import { Tooltip } from "./index.ts";

  let { label, onclick }: { label: string | undefined; onclick: () => void } =
    $props();
</script>

<Tooltip {label} aria-label="Rescan Sample Comics" {onclick}>R</Tooltip>
