import {
  Info,
  Palette,
  Settings2,
  Shield,
  SquareTerminal,
} from "@lucide/svelte";

import type { AppInfo } from "#lib/ipc/bindings.ts";
import LibraryGlyph from "#lib/navigation/LibraryGlyph.svelte";
import type { Glyph } from "#lib/page/glyph.ts";
import { m } from "#lib/paraglide/messages.js";
import type { Locale } from "#lib/paraglide/runtime.js";

export type SettingsRoute =
  | "/settings/library"
  | "/settings/appearance"
  | "/settings/privacy"
  | "/settings/general"
  | "/settings/advanced"
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

const PREFERENCES: readonly SettingsSection[] = [
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
    route: "/settings/privacy",
    label: m.privacy_title,
    icon: Shield,
    tone: "accent",
  },
  {
    route: "/settings/general",
    label: m.general_title,
    icon: Settings2,
    tone: "accent",
  },
];

const ADVANCED: SettingsSection = {
  route: "/settings/advanced",
  label: m.advanced_title,
  icon: SquareTerminal,
  tone: "neutral",
};

const ABOUT: SettingsSection = {
  route: "/settings/about",
  label: m.about_title,
  icon: Info,
  tone: "neutral",
};

/** The sections in their groups; only a development build has Advanced, which a release build leaves out rather than hides. */
export function settingsGroups(
  app: Pick<AppInfo, "isDevelopmentBuild">,
): readonly (readonly SettingsSection[])[] {
  return [PREFERENCES, app.isDevelopmentBuild ? [ADVANCED, ABOUT] : [ABOUT]];
}

/** Whether two panes already show a page in the section list, so a link back to it is not needed there. */
export function isListedBeside(route: ParentPage["route"]): boolean {
  return (
    route === "/settings" ||
    [...PREFERENCES, ADVANCED, ABOUT].some((section) => section.route === route)
  );
}
