<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { statusBadgeLook } from "#lib/status-badge.ts";
  import { STATUS_ICONS } from "#lib/status-icons.ts";
  import type { Status } from "#lib/wire.ts";

  let { status, class: className }: { status: Status; class?: string } =
    $props();

  const look = $derived(statusBadgeLook(status));
  const Icon = $derived(STATUS_ICONS[look.icon]);
</script>

<Badge variant={look.variant} class={className}>
  <Icon class="block-3 inline-3" />
  {look.label}
</Badge>
