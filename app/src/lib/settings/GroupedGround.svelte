<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  let {
    class: className,
    children,
  }: { class?: ClassValue; children: Snippet } = $props();
</script>

<div
  data-ground="grouped"
  class={[
    "ios:relative ios:isolate ios:-me-page-end ios:-mbs-page-top ios:flex ios:flex-1 ios:flex-col ios:bg-ios-grouped ios:pe-page-end ios:pbs-page-top ios:max-medium:-ms-page-start ios:max-medium:-mbe-floating-clearance ios:max-medium:ps-page-start ios:max-medium:pbe-floating-clearance ios:medium:-ms-gutter ios:medium:-mbe-page-bottom ios:medium:ps-gutter ios:medium:pbe-page-bottom",
    className,
  ]}
>
  {@render children()}
</div>
