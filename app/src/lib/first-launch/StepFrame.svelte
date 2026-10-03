<script lang="ts">
  import type { Snippet } from "svelte";

  let { children, actions }: { children: Snippet; actions: Snippet } = $props();
</script>

<div class="flex flex-1 flex-col pbs-xl medium:pbs-none">
  {@render children()}
</div>
<div class="flex flex-col gap-xs pbs-xl medium:flex-row medium:items-center">
  <div class="flex flex-col gap-xs medium:flex-row-reverse medium:gap-sm">
    {@render actions()}
  </div>
</div>
