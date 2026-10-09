<script lang="ts">
  let { details }: { details: string } = $props();
</script>

<pre
  class="self-stretch rounded-card bg-well px-list-row py-md font-mono text-code wrap-anywhere whitespace-pre-wrap select-text">{details}</pre>
