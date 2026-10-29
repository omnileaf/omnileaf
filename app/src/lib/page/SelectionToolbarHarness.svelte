<script lang="ts">
  import SelectionToolbar from "./SelectionToolbar.svelte";

  let { label, count }: { label: string; count: string } = $props();
</script>

<SelectionToolbar {label} {count}>
  <button type="button">Mark read</button>
</SelectionToolbar>
