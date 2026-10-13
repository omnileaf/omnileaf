export type PlanStatus = "in-development" | "planned";

export type Plan = {
  status: PlanStatus;
  title: string;
  summary: string;
};

export const PLANS: readonly Plan[] = [
  {
    status: "in-development",
    title: "Your own files",
    summary:
      "Comic archives such as CBZ and CB7, and folders of images. CBR and EPUB follow.",
  },
  {
    status: "planned",
    title: "Catalogs and servers",
    summary: "OPDS catalogs and self-hosted Komga and Kavita servers.",
  },
  {
    status: "planned",
    title: "Sync across devices",
    summary:
      "Reading progress, library and settings, on a hosted or self-hosted server.",
  },
  {
    status: "planned",
    title: "Offline reading",
    summary: "Downloads and read-ahead caching that stay on your device.",
  },
];
