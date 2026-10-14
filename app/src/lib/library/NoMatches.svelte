<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Empty, EmptyDescription } from "#lib/components/ui/empty/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  let { onClear }: { onClear: () => void } = $props();
</script>

<Empty class="mbs-lg items-start gap-sm text-start">
  <EmptyDescription class="text-body">
    {m.library_no_matches()}
  </EmptyDescription>
  <Button
    type="button"
    look="text"
    class="text-body min-block-touch-target"
    onclick={onClear}
  >
    {m.library_clear_filters()}
  </Button>
</Empty>
