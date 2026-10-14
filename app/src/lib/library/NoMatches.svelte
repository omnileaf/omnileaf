<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  let { onClear }: { onClear: () => void } = $props();
</script>

<div class="mbs-lg flex flex-col items-start gap-sm">
  <p class="text-body text-muted">{m.library_no_matches()}</p>
  <button
    type="button"
    class="text-body font-semibold text-accent min-block-touch-target"
    onclick={onClear}
  >
    {m.library_clear_filters()}
  </button>
</div>
