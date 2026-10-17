<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const CHEVRON_SIZE = 16;
</script>

<Tooltip
  label={m.reader_coming_soon({ feature: m.first_launch_home_change() })}
  type="button"
  aria-disabled="true"
  class="absolute inset-none flex items-center justify-end pe-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
>
  <span class="sr-only">{m.first_launch_home_change()}</span>
  <ChevronRight
    size={CHEVRON_SIZE}
    aria-hidden="true"
    class="text-muted rtl:-scale-x-100"
  />
</Tooltip>
