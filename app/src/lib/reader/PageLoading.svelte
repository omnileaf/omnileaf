<script lang="ts">
  import { Spinner } from "#lib/components/ui/spinner/index.ts";

  const SPINNER_SIZE = 20;

  let { label }: { label: string } = $props();
</script>

<Spinner size={SPINNER_SIZE} class="text-muted" />
<p class="text-small text-muted">{label}</p>
