import type { AdultTreatment, RelatedSeries } from "#lib/ipc/bindings.ts";

export interface RelatedShowing {
  readonly adultTreatment: AdultTreatment;
  readonly usesStandIns: boolean;
}

function leavesAdultOut({ adultTreatment, usesStandIns }: RelatedShowing) {
  return usesStandIns || adultTreatment === "hide";
}

export function shownRelated(
  related: readonly RelatedSeries[],
  showing: RelatedShowing,
): readonly RelatedSeries[] {
  return leavesAdultOut(showing)
    ? related.filter(({ isAdult }) => !isAdult)
    : related;
}
