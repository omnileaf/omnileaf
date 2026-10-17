import type { AdultContent, AdultTreatment } from "#lib/ipc/bindings.ts";

export const NEW_ADULT_CONTENT: AdultContent = {
  treatment: "show",
  countsAgeRatings: true,
};

export const ADULT_TREATMENTS = [
  "show",
  "blur",
  "hide",
] as const satisfies readonly AdultTreatment[];
