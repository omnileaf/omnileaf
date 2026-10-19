<script lang="ts">
  import { Play } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { resolve } from "$app/paths";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 18;

  let {
    book,
    series,
    class: className,
  }: { book: string; series: string; class?: ClassValue } = $props();

  const label = $derived(m.library_continue_series({ series }));
</script>

<Tooltip {label}>
  {#snippet child({ props })}
    <a
      {...props}
      href={resolve("/read/[book]", { book })}
      aria-label={label}
      class={[
        "touch-target-around flex items-center justify-center rounded-full bg-accent text-on-accent shadow-card-rest transition-control continue-disc hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      ]}
    >
      <Play size={ICON_SIZE} aria-hidden="true" class="ms-2xs" />
    </a>
  {/snippet}
</Tooltip>
