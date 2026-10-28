import { m } from "#lib/paraglide/messages.js";

const ONLY_A_NUMBER =
  /^(?:(?:vol(?:ume)?|chapter|ch|tome|book|part|episode|ep|issue|no|v)\.? ?)?[#第제]?\p{Nd}+(?:\.\p{Nd}+)?(?: ?[巻卷話话권화])?$/iu;

export interface MoreHeading {
  readonly lead: string;
  readonly tail: string;
}

export function moreHeading(
  bookTitle: string,
  seriesTitle: string,
): MoreHeading {
  return ONLY_A_NUMBER.test(bookTitle)
    ? { lead: seriesTitle, tail: m.reader_more_volume({ volume: bookTitle }) }
    : { lead: bookTitle, tail: "" };
}
