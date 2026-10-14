import {
  BookOpen,
  Clock,
  Compass,
  FolderOpen,
  Info,
  Languages,
  Palette,
  Settings,
  Shield,
  SquareTerminal,
} from "@lucide/svelte";

import { m } from "#lib/paraglide/messages.js";
import type { SettingsRoute } from "#lib/settings/sections.ts";

export interface Place {
  readonly route:
    | "/(app)"
    | "/(app)/browse"
    | "/(app)/history"
    | "/(app)/settings"
    | SettingsRoute;
  readonly label: () => string;
  readonly within: (() => string) | undefined;
  readonly icon: typeof Settings;
}

export const PLACES: readonly Place[] = [
  {
    route: "/(app)",
    label: m.library_title,
    within: undefined,
    icon: BookOpen,
  },
  {
    route: "/(app)/browse",
    label: m.browse_title,
    within: undefined,
    icon: Compass,
  },
  {
    route: "/(app)/history",
    label: m.history_title,
    within: undefined,
    icon: Clock,
  },
  {
    route: "/(app)/settings",
    label: m.settings_title,
    within: undefined,
    icon: Settings,
  },
  {
    route: "/(app)/settings/library",
    label: m.library_title,
    within: m.settings_title,
    icon: FolderOpen,
  },
  {
    route: "/(app)/settings/appearance",
    label: m.appearance_title,
    within: m.settings_title,
    icon: Palette,
  },
  {
    route: "/(app)/settings/privacy",
    label: m.privacy_title,
    within: m.settings_title,
    icon: Shield,
  },
  {
    route: "/(app)/settings/general",
    label: m.general_title,
    within: m.settings_title,
    icon: Languages,
  },
  {
    route: "/(app)/settings/advanced",
    label: m.advanced_title,
    within: m.settings_title,
    icon: SquareTerminal,
  },
  {
    route: "/(app)/settings/about",
    label: m.about_title,
    within: m.settings_title,
    icon: Info,
  },
];

export function placesMatching(text: string, locale: string): readonly Place[] {
  const wanted = text.trim().toLocaleLowerCase(locale);
  return PLACES.filter((place) =>
    [place.label(), place.within?.() ?? ""].some((name) =>
      name.toLocaleLowerCase(locale).includes(wanted),
    ),
  );
}
