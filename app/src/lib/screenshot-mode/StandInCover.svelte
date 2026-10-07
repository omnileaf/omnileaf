<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  interface Props {
    readonly format: string;
    readonly class?: ClassValue;
  }

  let { format, class: className }: Props = $props();
</script>

<div
  aria-hidden="true"
  class={[
    "flex aspect-cover items-center justify-center rounded-cover border border-cover-edge text-caption font-bold tracking-stand-in text-muted bg-stand-in-pattern small-caps expanded:text-detail",
    className,
  ]}
>
  {format}
</div>
