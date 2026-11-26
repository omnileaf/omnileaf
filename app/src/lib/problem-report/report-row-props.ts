import type { Snippet } from "svelte";

import type { IconName } from "#lib/icons/names.ts";
import type { Glyph } from "#lib/page/glyph.ts";

export interface IncludedSummaryProps {
  readonly icon: Glyph;
  readonly iconName: IconName;
  readonly label: string;
  readonly hint: string;
  readonly action?: Snippet | undefined;
}

export interface WayRowProps {
  readonly icon: Glyph;
  readonly iconName: IconName;
  readonly label: string;
  readonly opensBrowser: boolean;
  readonly onPress: () => void;
}
