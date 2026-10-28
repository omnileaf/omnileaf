import type { Platform } from "#lib/ipc/bindings.ts";

export type SheetHeight = "fit" | "medium" | "large";

export type SheetBackdrop = "dimmed" | "clear";

export type SheetGround = "plain" | "grouped";

export interface SheetLook {
  readonly scrim: string;
  readonly surface: string;
  readonly handle: string;
  readonly heights: Readonly<Record<SheetHeight, string>>;
  readonly backdrops: Readonly<Record<SheetBackdrop, string>>;
  readonly grounds: Readonly<Record<SheetGround, string>>;
}

const TODAYS_LOOK: SheetLook = {
  scrim: "",
  surface: "",
  handle: "",
  heights: { fit: "", medium: "", large: "" },
  backdrops: { dimmed: "", clear: "" },
  grounds: { plain: "", grouped: "" },
};

const NATIVE_LOOK: SheetLook = {
  scrim: "max-medium:bg-native-scrim",
  surface:
    "max-medium:rounded-ss-native-sheet max-medium:rounded-se-native-sheet android:max-medium:pbs-native-sheet-handle-area",
  handle:
    "max-medium:mbs-native-sheet-handle-start max-medium:mbe-native-sheet-handle-end max-medium:bg-native-sheet-handle max-medium:block-native-sheet-handle-thickness max-medium:inline-native-sheet-handle android:max-medium:absolute android:max-medium:inset-bs-none android:max-medium:inset-x-none android:max-medium:mx-auto",
  heights: {
    fit: "",
    medium: "max-medium:block-native-sheet-medium",
    large: "max-medium:block-native-sheet-large",
  },
  backdrops: {
    dimmed: "",
    clear: "max-medium:bg-transparent",
  },
  grounds: {
    plain: "max-medium:bg-native-sheet",
    grouped:
      "max-medium:bg-native-grouped-sheet max-medium:[--native-color-group:var(--native-color-sheet-group)]",
  },
};

const SHEET_LOOKS = {
  ios: NATIVE_LOOK,
  android: NATIVE_LOOK,
  linux: TODAYS_LOOK,
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, SheetLook>;

export function sheetLook(platform: Platform): SheetLook {
  return SHEET_LOOKS[platform];
}
