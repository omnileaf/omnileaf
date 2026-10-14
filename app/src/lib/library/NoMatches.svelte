<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  let { onClear }: { onClear: () => void } = $props();
</script>

<div class="mbs-lg flex flex-col items-start gap-sm">
  <p class="text-body text-muted">{m.library_no_matches()}</p>
  <Button
    type="button"
    look="text"
    class="text-body min-block-touch-target"
    onclick={onClear}
  >
    {m.library_clear_filters()}
  </Button>
</div>
