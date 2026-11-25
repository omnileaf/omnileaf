<script lang="ts">
  import { Tooltip } from "./index.ts";

  let {
    label,
    keys = [],
    onclick,
    onpointerup,
  }: {
    label: string | undefined;
    keys?: readonly string[];
    onclick: () => void;
    onpointerup?: (() => void) | undefined;
  } = $props();
</script>

<Tooltip
  {label}
  {keys}
  aria-label="Rescan Sample Comics"
  {onclick}
  {onpointerup}>R</Tooltip
>
