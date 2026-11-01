import { m } from "#lib/paraglide/messages.js";

import type { Section } from "./sections";

export interface Destination {
  readonly section: Section;
  readonly label: () => string;
}

export const DESTINATIONS: readonly Destination[] = [
  { section: "library", label: m.library_title },
  { section: "browse", label: m.browse_title },
  { section: "history", label: m.history_title },
  { section: "settings", label: m.settings_title },
];

export const SIDE_END_SECTION: Section = "settings";
