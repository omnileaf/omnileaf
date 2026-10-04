import type { Glyph } from "$lib/page/glyph";

export type Tone = "done" | "warning";

export type Urgency = "status" | "alert";

export interface Notice {
  readonly urgency: Urgency;
  readonly tone: Tone;
  readonly icon: Glyph;
  readonly title: string;
  readonly body?: string;
}
