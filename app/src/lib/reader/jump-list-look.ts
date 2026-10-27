import { cn } from "#lib/components/cn.ts";
import type { ButtonVariant } from "#lib/components/ui/button/looks.ts";
import type { ItemLook } from "#lib/components/ui/item/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone } from "#lib/page/platform.ts";
import { GROUP_PLATE } from "#lib/page/plates.ts";

export interface JumpListLook {
  readonly root: string;
  readonly find: string;
  readonly tools: string;
  readonly list: string;
  readonly row: ItemLook;
  readonly rowLayout: string;
  readonly current: string;
  readonly title: string;
  readonly currentTitle: string;
  readonly currentDetail: string;
  readonly missingTitle: string;
  readonly detail: string;
}

export type CrowdedShow = "menu" | "own-row";

export interface JumpListPhoneLook extends JumpListLook {
  readonly sort: ButtonVariant;
  readonly crowdedShow: CrowdedShow;
  readonly crowdedButton: ButtonVariant;
}

export const JUMP_LIST_LOOK: JumpListLook = {
  root: "flex flex-col gap-sm",
  find: "gap-sm rounded-shadcn-control border border-border bg-background px-md text-muted min-block-touch-target focus-within:border-accent expanded:min-block-pointer-button",
  tools: "flex items-stretch gap-sm",
  list: "flex flex-col overflow-hidden max-expanded:divide-y max-expanded:divide-border max-expanded:rounded-shadcn-control max-expanded:border max-expanded:border-border expanded:gap-2xs",
  row: "reader-jump-row",
  rowLayout: "",
  current: "border-accent bg-hover",
  title: "truncate text-body font-medium expanded:text-small",
  currentTitle: "",
  currentDetail: "",
  missingTitle: "line-through",
  detail:
    "flex items-center gap-xs text-small text-muted expanded:text-caption",
};

const PHONE_LOOK: JumpListLook = {
  root: "flex flex-col gap-md",
  find: "mx-lg gap-sm rounded-full bg-input-group px-md text-muted min-block-native-target focus-within:focus-ring",
  tools: "flex items-center gap-sm px-lg",
  list: "row-rules flex flex-col overflow-hidden",
  row: "row",
  rowLayout: "flex-col items-stretch gap-2xs",
  current: "",
  title: "truncate",
  currentTitle: "",
  currentDetail: "",
  missingTitle: "",
  detail: "flex items-center gap-xs",
};

const PHONE_LOOKS: Partial<Record<Platform, JumpListPhoneLook>> = {
  ios: {
    ...PHONE_LOOK,
    list: cn(PHONE_LOOK.list, "mx-lg border", GROUP_PLATE),
    currentTitle: "text-native-on-jump-current",
    sort: "secondary",
    crowdedShow: "menu",
    crowdedButton: "secondary",
  },
  android: {
    ...PHONE_LOOK,
    current:
      "bg-native-jump-current [--native-color-progress-rest:var(--native-color-jump-current-progress-rest)]",
    currentTitle: "text-native-on-jump-current",
    currentDetail: "text-native-on-jump-current",
    sort: "plain",
    crowdedShow: "own-row",
    crowdedButton: "outline",
  },
};

export function jumpListPhoneLook(
  platform: Platform,
  width: WidthClass,
): JumpListPhoneLook | undefined {
  return isPhone(platform, width) ? PHONE_LOOKS[platform] : undefined;
}
