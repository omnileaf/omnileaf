import { expect, test } from "vitest";

import type { RelatedSeries } from "#lib/ipc/bindings.ts";
import type { SeriesId } from "#lib/series/series-id.ts";

import { shownRelated } from "./related-shown.ts";

function related(title: string, isAdult: boolean): RelatedSeries {
  return {
    id: `0190a3e4-0000-8000-8000-${title.padStart(12, "0")}` as SeriesId,
    title,
    cover: null,
    bookCount: 5,
    readCount: 3,
    reason: { kind: "sameWriter" },
    isAdult,
  };
}

const LIKE_IT = [related("07", true), related("06", false)];

function titlesOf(shown: readonly RelatedSeries[]): string[] {
  return shown.map(({ title }) => title);
}

test("leaves 18+ series out while 18+ content is hidden", () => {
  const shown = shownRelated(LIKE_IT, {
    adultTreatment: "hide",
    usesStandIns: false,
  });

  expect(titlesOf(shown)).toEqual(["06"]);
});

test("leaves 18+ series out in Screenshot mode, whatever 18+ content is set to", () => {
  const shown = shownRelated(LIKE_IT, {
    adultTreatment: "show",
    usesStandIns: true,
  });

  expect(titlesOf(shown)).toEqual(["06"]);
});

test("keeps 18+ series while their covers are shown or blurred", () => {
  const treatments = (["show", "blur"] as const).map((adultTreatment) =>
    titlesOf(shownRelated(LIKE_IT, { adultTreatment, usesStandIns: false })),
  );

  expect(treatments).toEqual([
    ["07", "06"],
    ["07", "06"],
  ]);
});
