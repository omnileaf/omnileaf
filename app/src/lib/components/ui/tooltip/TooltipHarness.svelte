<script lang="ts">
  import { Tooltip } from "./index.ts";

  let {
    label,
    keys = [],
    onclick,
  }: {
    label: string | undefined;
    keys?: readonly string[];
    onclick: () => void;
  } = $props();
</script>

<Tooltip {label} {keys} aria-label="Rescan Sample Comics" {onclick}>R</Tooltip>
