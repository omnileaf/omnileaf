<script lang="ts">
  import type { BarRow } from "#lib/bars.ts";

  let { rows }: { rows: readonly BarRow[] } = $props();
</script>

<ul class="flex flex-col gap-3">
  {#each rows as row (row.label)}
    <li class="flex items-center gap-3 text-small">
      <span class="shrink-0 wrap-break-word inline-18 tablet:inline-21">
        {row.label}
      </span>
      <span
        class="flex-1 overflow-hidden rounded-full bg-chip block-2 min-inline-0"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 100 1"
          preserveAspectRatio="none"
          class="block block-2 inline-full"
        >
          <rect width={row.percent} height="1" class="fill-accent" />
        </svg>
      </span>
      <span class="shrink-0 text-end text-muted tabular-nums inline-7">
        {row.count}
      </span>
    </li>
  {/each}
</ul>
