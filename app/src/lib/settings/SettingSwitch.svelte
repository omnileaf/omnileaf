<script lang="ts">
  import SwitchTrack from "./SwitchTrack.svelte";

  interface Props {
    readonly label: string;
    readonly description: string;
    readonly isOn: boolean;
    readonly onToggle: () => void;
  }

  let { label, description, isOn, onToggle }: Props = $props();

  const id = $props.id();
</script>

<button
  type="button"
  role="switch"
  aria-checked={isOn}
  aria-labelledby="{id}-label"
  aria-describedby="{id}-description"
  class="flex items-center gap-md px-lg py-md text-start inline-full min-block-touch-target focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
  onclick={onToggle}
>
  <span class="flex flex-1 flex-col gap-2xs">
    <span id="{id}-label" class="font-medium expanded:font-semibold"
      >{label}</span
    >
    <span id="{id}-description" class="text-detail text-muted"
      >{description}</span
    >
  </span>
  <SwitchTrack {isOn} />
</button>
