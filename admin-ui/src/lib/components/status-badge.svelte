<script lang="ts">
  import Archive from "@lucide/svelte/icons/archive";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import Copy from "@lucide/svelte/icons/copy";
  import Eye from "@lucide/svelte/icons/eye";
  import Inbox from "@lucide/svelte/icons/inbox";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import type { IconComponent } from "#lib/components/ui/types.ts";
  import { type StatusIconName, statusBadgeLook } from "#lib/status-badge.ts";
  import type { Status } from "#lib/wire.ts";

  const ICONS = {
    inbox: Inbox,
    eye: Eye,
    "circle-check": CircleCheck,
    copy: Copy,
    archive: Archive,
  } satisfies Record<StatusIconName, IconComponent>;

  let { status, class: className }: { status: Status; class?: string } =
    $props();

  const look = $derived(statusBadgeLook(status));
  const Icon = $derived(ICONS[look.icon]);
</script>

<Badge variant={look.variant} class={className}>
  <Icon class="block-3.5 inline-3.5" />
  {look.label}
</Badge>
