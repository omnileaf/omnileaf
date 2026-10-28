<script lang="ts">
  interface Props {
    readonly id: string;
    readonly label: string;
    readonly description: string | undefined;
  }

  let { id, label, description }: Props = $props();
</script>

<span class="flex flex-1 flex-col gap-2xs wrap-break-word min-inline-none">
  <span id="{id}-label" class="font-medium expanded:font-semibold">{label}</span
  >
  {#if description !== undefined}
    <span id="{id}-description" class="text-detail text-muted"
      >{description}</span
    >
  {/if}
</span>
