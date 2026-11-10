import type { BookSection, SeriesSection } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export interface TabWords {
  readonly text: string;
  readonly label: string;
}

export const SECTION_NAMES = {
  volumes: m.series_section_volumes,
  chapters: m.series_section_chapters,
  specials: m.series_section_specials,
} satisfies Record<BookSection, () => string>;

const SECTION_COUNTS = {
  volumes: (count: number) => m.series_volume_count({ count }),
  chapters: (count: number) => m.series_chapter_count({ count }),
  specials: (count: number) => m.series_special_count({ count }),
} satisfies Record<BookSection, (count: number) => string>;

export function sectionCount({ section, bookCount }: SeriesSection): string {
  return SECTION_COUNTS[section](bookCount);
}

export function tabWords({ section, bookCount }: SeriesSection): TabWords {
  const name = SECTION_NAMES[section]();
  return {
    text: m.series_section_tab({ name, count: bookCount }),
    label: m.series_section_tab_label({ name, count: bookCount }),
  };
}
