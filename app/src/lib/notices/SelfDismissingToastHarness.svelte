<script lang="ts">
  import type { ToastHandle } from "./notices";

  let { toast }: { toast: ToastHandle } = $props();

  $effect(() => {
    toast.dismiss();
  });
</script>

<p>Finding books</p>
