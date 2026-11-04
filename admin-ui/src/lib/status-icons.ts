import Check from "@lucide/svelte/icons/check";
import CircleDot from "@lucide/svelte/icons/circle-dot";
import CircleMinus from "@lucide/svelte/icons/circle-minus";
import Clock from "@lucide/svelte/icons/clock";
import Copy from "@lucide/svelte/icons/copy";

import type { IconComponent } from "#lib/components/ui/types.ts";
import type { StatusIconName } from "#lib/status-badge.ts";

export const STATUS_ICONS = {
  "circle-dot": CircleDot,
  clock: Clock,
  check: Check,
  copy: Copy,
  "circle-minus": CircleMinus,
} satisfies Record<StatusIconName, IconComponent>;
