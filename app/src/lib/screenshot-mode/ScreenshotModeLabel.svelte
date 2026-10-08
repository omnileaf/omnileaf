<script lang="ts">
  import { ScanLine } from "@lucide/svelte";

  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 14;
</script>

<span
  class="inline-flex shrink-0 items-center gap-xs rounded-full bg-foreground py-xs ps-sm pe-md text-caption font-bold text-background"
>
  <ScanLine size={ICON_SIZE} />
  {m.screenshot_mode_title()}
</span>
