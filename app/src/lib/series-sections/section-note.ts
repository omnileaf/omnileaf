import type { BookSection, NumberRange, Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

import { missingVolumeCount, missingVolumeNumbers } from "./book-number-words";

export interface NotedSeries {
  readonly sections: readonly BookSection[];
  readonly missingVolumes: readonly NumberRange[];
  readonly lastVolume: number | null;
}

function gapNote(missing: readonly NumberRange[]): string | undefined {
  const count = missingVolumeCount(missing);
  return count > 0
    ? m.series_gap_note({
        count,
        gaps: missing.length,
        volumes: missingVolumeNumbers(missing),
      })
    : undefined;
}

function chaptersNote(lastVolume: number | null): string {
  return lastVolume === null
    ? m.series_chapters_note()
    : m.series_chapters_note_after({ number: lastVolume });
}

export function sectionNote(
  section: BookSection,
  series: NotedSeries,
): string | undefined {
  switch (section) {
    case "volumes":
      return gapNote(series.missingVolumes);
    case "chapters":
      return series.sections.includes("volumes")
        ? chaptersNote(series.lastVolume)
        : undefined;
    case "specials":
      return m.series_specials_note();
  }
}

const PLATFORMS_WITHOUT_NOTES: readonly Platform[] = ["android"];

export function showsSectionNotes(platform: Platform): boolean {
  return !PLATFORMS_WITHOUT_NOTES.includes(platform);
}
