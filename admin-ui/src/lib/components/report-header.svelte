<script lang="ts">
  import type { Snippet } from "svelte";

  import StatusBadge from "#lib/components/status-badge.svelte";
  import type { Status } from "#lib/wire.ts";

  let {
    code,
    status,
    actions,
  }: {
    code: string;
    status?: Status | undefined;
    actions?: Snippet | undefined;
  } = $props();
</script>

<div
  class="mbe-5 flex flex-col gap-4 tablet:mbe-6 tablet:flex-row tablet:items-center tablet:justify-between"
>
  <div class="flex flex-wrap items-center gap-3 min-inline-0">
    <h1 tabindex="-1" class="font-mono text-title font-semibold wrap-anywhere">
      {code}
    </h1>
    {#if status !== undefined}
      <StatusBadge {status} />
    {/if}
  </div>
  {@render actions?.()}
</div>
