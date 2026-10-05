<script lang="ts">
  let { isOn }: { readonly isOn: boolean } = $props();
</script>

<span
  aria-hidden="true"
  class={[
    "flex shrink-0 items-center rounded-full p-switch-inset transition-colors block-switch-thickness inline-switch-length motion-safe:duration-fade expanded:block-switch-thickness-compact expanded:inline-switch-length-compact",
    isOn ? "justify-end bg-accent" : "bg-switch-off",
  ]}
>
  <span
    class="rounded-full bg-switch-knob shadow-knob block-switch-knob inline-switch-knob expanded:block-switch-knob-compact expanded:inline-switch-knob-compact"
  ></span>
</span>
