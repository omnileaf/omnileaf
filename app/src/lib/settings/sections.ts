import {
  Info,
  Library,
  type LucideIcon,
  Palette,
  Settings,
} from "@lucide/svelte";

import { m } from "$lib/paraglide/messages.js";

export type SettingsRoute =
  | "/settings/library"
  | "/settings/appearance"
  | "/settings/general"
  | "/settings/about";

export interface SettingsSection {
  readonly route: SettingsRoute;
  readonly label: () => string;
  readonly icon: LucideIcon;
  readonly tone: "accent" | "neutral";
}

export const SETTINGS_GROUPS: readonly (readonly SettingsSection[])[] = [
  [
    {
      route: "/settings/library",
      label: m.library_title,
      icon: Library,
      tone: "accent",
    },
    {
      route: "/settings/appearance",
      label: m.appearance_title,
      icon: Palette,
      tone: "accent",
    },
  ],
  [
    {
      route: "/settings/general",
      label: m.general_title,
      icon: Settings,
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
