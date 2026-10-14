<script lang="ts">
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  let {
    label,
    class: className,
    children,
  }: { label: string; class: string; children: Snippet } = $props();
</script>

<Tooltip
  label={m.reader_coming_soon({ feature: label })}
  type="button"
  aria-disabled="true"
  aria-label={label}
  class={cn(
    "text-muted focus-visible:outline-2 focus-visible:outline-accent",
    className,
  )}
>
  {@render children()}
</Tooltip>
