import type { BadgeVariant } from "#lib/components/ui/badge/variants.ts";
import { copy } from "#lib/copy.ts";
import type { Status, StatusKind } from "#lib/wire.ts";

const STATUS_LOOKS = {
  received: { variant: "solid", icon: "inbox" },
  reviewing: { variant: "soft", icon: "eye" },
  published: { variant: "outline", icon: "circle-check" },
  duplicate: { variant: "chip", icon: "copy" },
  closed: { variant: "muted-outline", icon: "archive" },
} as const satisfies Record<
  StatusKind,
  { variant: BadgeVariant; icon: string }
>;

export type StatusIconName = (typeof STATUS_LOOKS)[StatusKind]["icon"];

export interface StatusBadgeLook {
  readonly label: string;
  readonly variant: BadgeVariant;
  readonly icon: StatusIconName;
}

export function statusBadgeLook(status: Status): StatusBadgeLook {
  return { label: copy.status[status.kind], ...STATUS_LOOKS[status.kind] };
}
