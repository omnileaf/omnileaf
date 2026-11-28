import {
  DOCKED_BAR,
  DOCKED_ROW,
  FLOATING_BAR,
} from "#lib/navigation/tab-bar.ts";
import type { PhonePlatform } from "#lib/page/platform.ts";
import { NATIVE_TOP_BAR } from "#lib/page/top-bar.ts";

export type BarControl = "close" | "done" | "selectAll";

export interface PhonePicking {
  readonly leading: readonly BarControl[];
  readonly trailing: readonly BarControl[];
  readonly endsWhenNonePicked: boolean;
  readonly hasDeselectAll: boolean;
  readonly title: string;
  readonly toolbar: string;
  readonly toolbarRow: string;
  readonly action: string;
  readonly isIconOnly: boolean;
  readonly isDocked: boolean;
  readonly overTopBar: string | undefined;
}

const IOS_PICKING: PhonePicking = {
  leading: ["selectAll"],
  trailing: ["done"],
  endsWhenNonePicked: false,
  hasDeselectAll: true,
  title: "text-center",
  toolbar: FLOATING_BAR,
  toolbarRow: "flex items-center gap-2xs max-inline-full",
  action: "disabled:text-faint",
  isIconOnly: true,
  isDocked: false,
  overTopBar: undefined,
};

export const ANDROID_PICKING = {
  leading: ["close"],
  trailing: ["selectAll"],
  endsWhenNonePicked: true,
  hasDeselectAll: false,
  title: "",
  toolbar: `fixed inset-x-none inset-be-none z-tab-bar ps-safe-start pbe-safe-bottom ${DOCKED_BAR}`,
  toolbarRow: `flex ${DOCKED_ROW}`,
  action: "flex-1 flex-col gap-2xs min-inline-none disabled:text-faint",
  isIconOnly: false,
  isDocked: true,
  overTopBar: `fixed inset-bs-none inset-x-none z-series-bar flex flex-wrap items-center gap-sm ps-series-bar-start pe-series-bar-end pbs-series-bar-top pbe-sm ${NATIVE_TOP_BAR.scrolled}`,
} as const satisfies PhonePicking;

export const PHONE_PICKING: Readonly<Record<PhonePlatform, PhonePicking>> = {
  ios: IOS_PICKING,
  android: ANDROID_PICKING,
};
