<script lang="ts">
  import { TOAST_BAR } from "./toast-bar";

  let { message }: { message: string } = $props();
</script>

<div class={[TOAST_BAR, "px-lg py-sm"]}>
  <p class="flex items-center text-label min-block-touch-target">{message}</p>
</div>
