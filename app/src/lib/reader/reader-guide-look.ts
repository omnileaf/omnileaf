import type {
  ButtonLook,
  ButtonVariant,
} from "#lib/components/ui/button/looks.ts";
import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { phoneOf } from "#lib/page/platform.ts";

type DoneButton =
  { readonly look: ButtonLook } | { readonly variant: ButtonVariant };

export interface ReaderGuideLook {
  readonly overlay: string;
  readonly zone: string;
  readonly controlsZone: string;
  readonly edgeZone: string;
  readonly controlsEdgeZone: string;
  readonly hasBadge: boolean;
  readonly card: string;
  readonly title: string;
  readonly body: string;
  readonly doneButton: DoneButton;
  readonly done: string;
}

const TODAYS_ZONE =
  "border border-dashed border-foreground/60 px-sm pbs-reader-guide-labels text-body font-medium text-foreground expanded:text-group-title";

const TODAYS_ZONE_LOOK = `flex items-start justify-center text-center ${TODAYS_ZONE}`;

const TODAYS_EDGE_ZONE =
  "flex flex-1 items-start justify-center border-e border-dashed border-foreground/60 px-sm pbs-reader-guide-labels text-center text-body font-medium text-foreground last:border-e-0 expanded:text-group-title";

const TODAYS_LOOK: ReaderGuideLook = {
  overlay: "bg-reader-black/40",
  zone: TODAYS_ZONE_LOOK,
  controlsZone: TODAYS_ZONE_LOOK,
  controlsEdgeZone: TODAYS_EDGE_ZONE,
  edgeZone: TODAYS_EDGE_ZONE,
  hasBadge: true,
  card: "inset-be-reader-guide gap-lg",
  title: "text-group-title",
  body: "text-body expanded:text-small",
  doneButton: { look: "primary" },
  done: "flex-1 rounded-shadcn-button px-lg font-medium min-block-touch-target expanded:flex-none expanded:text-small expanded:min-block-pointer-button",
};

const ZONE_LABEL =
  "flex items-center justify-center p-lg text-center text-native-tab-label leading-native-tab-label font-native-tab-label tracking-native-tab-label reader-zone-edge";

const EDGE_TINT = "bg-native-tab-pill/90 text-native-on-tab-pill";
const CONTROLS_TINT = "bg-native-reader-guide-menu-zone text-foreground";

const ANDROID_PHONE_LOOK: ReaderGuideLook = {
  overlay: "",
  zone: `${ZONE_LABEL} ${EDGE_TINT}`,
  controlsZone: `${ZONE_LABEL} ${CONTROLS_TINT}`,
  edgeZone: `${ZONE_LABEL} flex-1 ${EDGE_TINT}`,
  controlsEdgeZone: `${ZONE_LABEL} flex-1 ${CONTROLS_TINT}`,
  hasBadge: false,
  card: "inset-be-native-reader-guide-card-end gap-sm",
  title: "text-native-row-title leading-native-row-title font-medium",
  body: ROW_SUBTITLE_TYPE,
  doneButton: { variant: "plain" },
  done: "ms-auto",
};

export function readerGuideLook(
  platform: Platform,
  width: WidthClass,
): ReaderGuideLook {
  return phoneOf(platform, width) === "android"
    ? ANDROID_PHONE_LOOK
    : TODAYS_LOOK;
}
