import type { WindowBackdrop } from "#lib/ipc/bindings.ts";

const CONTRASTS = ["more", "medium", "high"] as const;

const TRANSPARENCIES = ["reduced"] as const;

export type Contrast = (typeof CONTRASTS)[number];

export type Transparency = (typeof TRANSPARENCIES)[number];

export interface DisplayModes {
  readonly contrast: Contrast | undefined;
  readonly transparency: Transparency | undefined;
}

function markRoot(attribute: string, value: string | undefined): void {
  const root = document.documentElement;
  if (value === undefined) {
    root.removeAttribute(attribute);
  } else {
    root.setAttribute(attribute, value);
  }
}

export function followContrast(contrast: Contrast | undefined): void {
  markRoot("data-contrast", contrast);
}

export interface ThemeMatch {
  readonly status: "ok" | "error";
}

/** Windows draws Mica in the window's own theme, so the shell stays solid until the window takes the app's theme. */
export async function followWindowBackdropOnceThemed(
  backdrop: WindowBackdrop,
  themed: Promise<ThemeMatch>,
): Promise<void> {
  const { status } = await themed;
  markRoot("data-backdrop", status === "ok" ? backdrop : "none");
}

export function followDisplayModes({
  contrast,
  transparency,
}: DisplayModes): void {
  followContrast(contrast);
  markRoot("data-transparency", transparency);
}

function oneOf<Choice extends string>(
  choices: readonly Choice[],
  asked: string | null,
): Choice | undefined {
  return choices.find((choice) => choice === asked);
}

export function displayModesFrom(search: URLSearchParams): DisplayModes {
  return {
    contrast: oneOf(CONTRASTS, search.get("contrast")),
    transparency: oneOf(TRANSPARENCIES, search.get("transparency")),
  };
}
