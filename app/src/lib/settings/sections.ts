import {
  BookOpen,
  Info,
  Palette,
  Settings2,
  Shield,
  SquareTerminal,
} from "@lucide/svelte";

import LibraryGlyph from "#lib/navigation/LibraryGlyph.svelte";
import type { Glyph } from "#lib/page/glyph.ts";
import { m } from "#lib/paraglide/messages.js";
import type { Locale } from "#lib/paraglide/runtime.js";

export type SettingsRoute =
  | "/(app)/settings/library"
  | "/(app)/settings/appearance"
  | "/(app)/settings/reading"
  | "/(app)/settings/privacy"
  | "/(app)/settings/general"
  | "/(app)/settings/advanced"
  | "/(app)/settings/about";

export type SettingsSubPage =
  | "/(app)/settings/about/licences"
  | "/(app)/settings/advanced/animations"
  | "/(app)/settings/general/language"
  | "/(app)/settings/library/adult-content"
  | "/(app)/settings/library/tags"
  | "/(app)/settings/library/tabs"
  | "/(app)/settings/privacy/screenshot-mode";

export type SettingsPage = "/(app)/settings" | SettingsRoute | SettingsSubPage;

export interface ParentPage {
  readonly route: SettingsPage;
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

const PREFERENCES: readonly SettingsSection[] = [
  {
    route: "/(app)/settings/general",
    label: m.general_title,
    icon: Settings2,
    tone: "accent",
  },
  {
    route: "/(app)/settings/appearance",
    label: m.appearance_title,
    icon: Palette,
    tone: "accent",
  },
  {
    route: "/(app)/settings/library",
    label: m.library_title,
    icon: LibraryGlyph,
    tone: "accent",
  },
  {
    route: "/(app)/settings/reading",
    label: m.reading_title,
    icon: BookOpen,
    tone: "accent",
  },
  {
    route: "/(app)/settings/privacy",
    label: m.privacy_title,
    icon: Shield,
    tone: "accent",
  },
];

const ADVANCED: SettingsSection = {
  route: "/(app)/settings/advanced",
  label: m.advanced_title,
  icon: SquareTerminal,
  tone: "neutral",
};

const ABOUT: SettingsSection = {
  route: "/(app)/settings/about",
  label: m.about_title,
  icon: Info,
  tone: "neutral",
};

export const SETTINGS_GROUPS: readonly (readonly SettingsSection[])[] = [
  PREFERENCES,
  [ADVANCED, ABOUT],
];

export function isListedBeside(route: SettingsPage): boolean {
  return (
    route === "/(app)/settings" ||
    SETTINGS_GROUPS.flat().some((section) => section.route === route)
  );
}
