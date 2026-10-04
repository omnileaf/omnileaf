import { Info, Palette, Settings2, Shield } from "@lucide/svelte";

import LibraryGlyph from "$lib/navigation/LibraryGlyph.svelte";
import type { Glyph } from "$lib/page/glyph";
import { m } from "$lib/paraglide/messages.js";
import type { Locale } from "$lib/paraglide/runtime.js";

export type SettingsRoute =
  | "/settings/library"
  | "/settings/appearance"
  | "/settings/privacy"
  | "/settings/general"
  | "/settings/about";

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
