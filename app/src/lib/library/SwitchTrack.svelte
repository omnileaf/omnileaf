<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  let { class: className }: { class?: ClassValue } = $props();
</script>

<span
  aria-hidden="true"
  class={[
    "flex shrink-0 items-center rounded-full bg-switch-off p-switch-inset block-switch-thickness-compact inline-switch-length-compact peer-checked:justify-end peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
    className,
  ]}
>
  <span
    class="rounded-full bg-switch-knob block-switch-knob-compact inline-switch-knob-compact"
  ></span>
</span>
