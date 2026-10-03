import { Info, Palette, Settings2 } from "@lucide/svelte";

import LibraryGlyph from "$lib/navigation/LibraryGlyph.svelte";
import type { Glyph } from "$lib/page/glyph";
import { m } from "$lib/paraglide/messages.js";
import type { Locale } from "$lib/paraglide/runtime.js";

export type SettingsRoute =
  | "/settings/library"
  | "/settings/appearance"
  | "/settings/general"
  | "/settings/about";

export type SettingsSubPage = "/settings/about/licences";

export interface ParentPage {
  readonly route: "/settings" | SettingsRoute | SettingsSubPage;
  readonly title: string;
}

export interface SectionSummary {
  readonly text: string;
  readonly lang?: Locale;
}

export interface SettingsSection {
  readonly route: SettingsRoute;
  readonly label: () => string;
  readonly icon: Glyph;
  readonly tone: "accent" | "neutral";
}

export function isWithinSection(
  pathname: string,
  sectionPath: string,
): boolean {
  return pathname === sectionPath || pathname.startsWith(`${sectionPath}/`);
}

export type SectionCurrent = "page" | "true" | undefined;

export function sectionCurrent(
  pathname: string,
  sectionPath: string,
): SectionCurrent {
  if (pathname === sectionPath) {
    return "page";
  }
  return isWithinSection(pathname, sectionPath) ? "true" : undefined;
}

export const SETTINGS_GROUPS: readonly (readonly SettingsSection[])[] = [
  [
    {
      route: "/settings/library",
      label: m.library_title,
      icon: LibraryGlyph,
      tone: "accent",
    },
    {
      route: "/settings/appearance",
      label: m.appearance_title,
      icon: Palette,
      tone: "accent",
    },
    {
      route: "/settings/general",
      label: m.general_title,
      icon: Settings2,
      tone: "accent",
    },
  ],
  [
    {
      route: "/settings/about",
      label: m.about_title,
      icon: Info,
      tone: "neutral",
    },
  ],
];
