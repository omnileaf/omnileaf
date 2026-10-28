<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import { openHandedFiles } from "./open-handed-files.ts";

  onMount(() => openHandedFiles((page) => void goto(page), reportError));
</script>
