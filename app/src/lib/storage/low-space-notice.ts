import { TriangleAlert } from "@lucide/svelte";

import type { Notice } from "#lib/notices/notices.ts";
import { m } from "#lib/paraglide/messages.js";

import { formatBytes } from "./bytes";
import type { DeviceWord } from "./device";

const SPACE_LEFT = {
  phone: m.low_space_notice_phone,
  tablet: m.low_space_notice_tablet,
  computer: m.low_space_notice_computer,
} satisfies Record<DeviceWord, (inputs: { size: string }) => string>;

export function lowSpaceNotice(
  freeBytes: number,
  device: DeviceWord,
  freeUpSpace: () => void,
): Notice {
  return {
    tone: "warning",
    icon: TriangleAlert,
    title: m.attention_low_space_title(),
    body: SPACE_LEFT[device]({ size: formatBytes(freeBytes) }),
    action: { label: m.attention_free_up_space(), run: freeUpSpace },
  };
}
