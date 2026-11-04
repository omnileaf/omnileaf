<script lang="ts">
  import { resolve } from "$app/paths";

  import { cn } from "#lib/cn.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import type { Listed } from "#lib/wire.ts";

  let { report }: { report: Listed } = $props();

  const LINK_LOOK =
    "inline-flex items-center rounded-control font-mono text-label font-medium underline decoration-border underline-offset-4 block-11 tablet:block-9";
</script>

<a
  href={resolve("/reports/[code]", { code: report.code })}
  class={cn(LINK_LOOK, FOCUS_RING)}
>
  {report.code}
</a>
