<script lang="ts">
  let { details }: { details: string } = $props();
</script>

<pre
  class="self-stretch rounded-tile bg-chip px-list-row py-md font-mono text-code wrap-anywhere whitespace-pre-wrap">{details}</pre>
