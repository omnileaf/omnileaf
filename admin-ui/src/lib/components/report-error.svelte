<script lang="ts">
  import CircleAlert from "@lucide/svelte/icons/circle-alert";

  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { copy } from "#lib/copy.ts";

  let { message, onRetry }: { message: string; onRetry: () => void } = $props();
</script>

<Alert icon={CircleAlert}>
  <AlertTitle>{copy.report.loadFailed}</AlertTitle>
  <AlertDescription>{message}</AlertDescription>
  <div class="mbs-2">
    <Button variant="outline" onclick={onRetry}>
      {copy.shell.retry}
    </Button>
  </div>
</Alert>
