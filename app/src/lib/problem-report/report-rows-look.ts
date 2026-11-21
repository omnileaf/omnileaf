import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
import { CARD_PLATE, GROUP_PLATE } from "#lib/page/plates.ts";
import {
  FLUSH_LIST,
  FLUSH_LIST_HEADING,
} from "#lib/settings/android-flush-look.ts";

export type ReportRowsLook = "flush" | "card";

export const TILE_ICON_SIZE = 16;

export const ICON_TILE =
  "flex shrink-0 items-center justify-center rounded-tile border border-border bg-card block-entry-tile inline-entry-tile";

export const REPORT_LISTS = {
  flush: FLUSH_LIST,
  card: `flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-card ${GROUP_PLATE}`,
} satisfies Record<ReportRowsLook, string>;

export const REPORT_HEADINGS = {
  flush: FLUSH_LIST_HEADING,
  card: "mbe-ways-heading-gap text-small font-semibold",
} satisfies Record<ReportRowsLook, string>;

export const REPORT_CARDS = {
  flush: "px-none",
  card: `rounded-card border border-border bg-card px-lg py-field-card-block ${CARD_PLATE}`,
} satisfies Record<ReportRowsLook, string>;

export class CurrentReportRowsLook {
  readonly #android = new AndroidPhone();

  get current(): ReportRowsLook {
    return this.#android.isOn ? "flush" : "card";
  }
}
