<script lang="ts">
  import { cn } from "#lib/components/cn.ts";
  import { BUTTON_LOOKS } from "#lib/components/ui/button/looks.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { stepButtonClass, type StepButtonKind } from "./step-button.ts";

  let { kind, label }: { kind: StepButtonKind; label: string } = $props();
</script>

<Tooltip
  label={m.reader_coming_soon({ feature: label })}
  type="button"
  aria-disabled="true"
  class={cn(BUTTON_LOOKS[kind], stepButtonClass(kind))}
>
  {label}
</Tooltip>
