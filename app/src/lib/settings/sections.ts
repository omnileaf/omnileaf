import {
  BookOpen,
  Info,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
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
  | "/(app)/settings/about/report"
  | "/(app)/settings/about/reports"
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

export type SectionChip = "grey" | "blue" | "green" | "orange";

export interface SettingsSection {
  readonly route: SettingsRoute;
  readonly label: () => string;
  readonly icon: Glyph;
  /** The colour of the section's tile in the iOS Settings list. */
  readonly chip: SectionChip;
}

export interface SettingsGroup {
  readonly heading?: () => string;
  readonly sections: readonly SettingsSection[];
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

const GENERAL: SettingsSection = {
  route: "/(app)/settings/general",
  label: m.general_title,
  icon: Settings,
  chip: "grey",
};

const APPEARANCE: SettingsSection = {
  route: "/(app)/settings/appearance",
  label: m.appearance_title,
  icon: Sun,
  chip: "blue",
};

const LIBRARY: SettingsSection = {
  route: "/(app)/settings/library",
  label: m.library_title,
  icon: LibraryGlyph,
  chip: "green",
};

const READING: SettingsSection = {
  route: "/(app)/settings/reading",
  label: m.reading_title,
  icon: BookOpen,
  chip: "orange",
};

const PRIVACY: SettingsSection = {
  route: "/(app)/settings/privacy",
  label: m.privacy_title,
  icon: ShieldCheck,
  chip: "blue",
};

const ADVANCED: SettingsSection = {
  route: "/(app)/settings/advanced",
  label: m.advanced_title,
  icon: SlidersHorizontal,
  chip: "grey",
};

const ABOUT: SettingsSection = {
  route: "/(app)/settings/about",
  label: m.about_title,
  icon: Info,
  chip: "grey",
};

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  { heading: m.settings_group_app, sections: [GENERAL, APPEARANCE] },
  { heading: m.settings_group_reading, sections: [LIBRARY, READING] },
  { heading: m.settings_group_data, sections: [PRIVACY, ADVANCED] },
  { sections: [ABOUT] },
];

export const SETTINGS_SECTIONS: readonly SettingsSection[] =
  SETTINGS_GROUPS.flatMap(({ sections }) => sections);
