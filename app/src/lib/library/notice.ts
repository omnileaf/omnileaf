import type { Glyph } from "$lib/page/glyph";

export type Tone = "done" | "warning";

export interface Notice {
  readonly tone: Tone;
  readonly icon: Glyph;
  readonly title: string;
  readonly body?: string;
}
