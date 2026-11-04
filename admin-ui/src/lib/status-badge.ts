import type { BadgeVariant } from "#lib/components/ui/badge/variants.ts";
import { copy } from "#lib/copy.ts";
import { fillTemplate } from "#lib/template.ts";
import type { Status, StatusKind } from "#lib/wire.ts";

const STATUS_LOOKS = {
  received: { variant: "solid", icon: "circle-dot" },
  reviewing: { variant: "soft", icon: "clock" },
  published: { variant: "outline", icon: "check" },
  duplicate: { variant: "chip", icon: "copy" },
  closed: { variant: "muted-outline", icon: "circle-minus" },
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

function labelOf(status: Status): string {
  const word = copy.status[status.kind];
  return status.kind === "published"
    ? fillTemplate(copy.statusWithIssue, { status: word, issue: status.issue })
    : word;
}

export function statusBadgeLook(status: Status): StatusBadgeLook {
  return { label: labelOf(status), ...STATUS_LOOKS[status.kind] };
}

export function statusIcon(kind: StatusKind): StatusIconName {
  return STATUS_LOOKS[kind].icon;
}
