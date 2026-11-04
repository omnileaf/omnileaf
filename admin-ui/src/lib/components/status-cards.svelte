<script lang="ts">
  import { resolve } from "$app/paths";

  import { cn } from "#lib/cn.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import { copy } from "#lib/copy.ts";
  import { filterToQuery } from "#lib/reports-query.ts";
  import { statusIcon } from "#lib/status-badge.ts";
  import { STATUS_ICONS } from "#lib/status-icons.ts";
  import { STATUS_KINDS, type StatusKind } from "#lib/wire.ts";

  let { counts }: { counts: Record<StatusKind, number> } = $props();

  const ATTENTION: StatusKind = "received";
</script>

<ul class="grid grid-cols-2 gap-3 tablet:grid-cols-5 tablet:gap-4">
  {#each STATUS_KINDS as kind (kind)}
    {@const Icon = STATUS_ICONS[statusIcon(kind)]}
    <li class="last:col-span-2 tablet:last:col-span-1">
      <a
        href={resolve(`/reports${filterToQuery({ status: kind })}`)}
        class={cn("block rounded-card", FOCUS_RING)}
      >
        <Card
          class={cn(
            "gap-1 px-5 py-4 transition-colors hover:bg-well",
            kind === ATTENTION ? "border-accent" : "",
          )}
        >
          <span
            class="flex items-center justify-between gap-2 text-label font-semibold text-muted"
          >
            {copy.status[kind]}
            <Icon class="block-3.5 inline-3.5" />
          </span>
          <span
            class={cn(
              "text-heading font-semibold tracking-tight tabular-nums",
              kind === ATTENTION ? "text-accent-ink" : "",
            )}
          >
            {counts[kind]}
          </span>
          <span class="text-badge text-muted">
            {copy.dashboard.statusNotes[kind]}
          </span>
        </Card>
      </a>
    </li>
  {/each}
</ul>
