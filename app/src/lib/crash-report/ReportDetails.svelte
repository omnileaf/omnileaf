<script lang="ts">
  let { details, onPhone }: { details: string; onPhone: boolean } = $props();
</script>

<pre
  class={[
    "self-stretch bg-chip px-list-row py-md font-mono text-code wrap-anywhere whitespace-pre-wrap",
    onPhone ? "rounded-card" : "rounded-tile",
  ]}>{details}</pre>
